/**
 * MAIN APP
 * Gestion des événements, états des boutons et logiques UI.
 */

document.addEventListener("DOMContentLoaded", () => {
    
    // Initialisation
    const audioEngine = new AudioEngine();
    const notationManager = new NotationManager("canvasContainer");

    // --- Éléments UI Partie 1 (Générateur Partition) ---
    const audioSourceSelect = document.getElementById("audioSource");
    const fileInput = document.getElementById("fileInput");
    const btnSelectFile = document.getElementById("btnSelectFile");
    const btnPlay = document.getElementById("btnPlay");
    const btnStop = document.getElementById("btnStop");
    const btnExport = document.getElementById("btnExport");
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const progressBar = document.getElementById("progressBar");
    const currentTimeSpan = document.getElementById("currentTime");
    const totalTimeSpan = document.getElementById("totalTime");

    // --- Éléments UI Partie 2 (Enregistreur Audio) ---
    const btnRecStart = document.getElementById("btnRecStart");
    const btnRecStop = document.getElementById("btnRecStop");
    const recorderStatus = document.getElementById("recorderStatus");

    // Variables d'état
    let currentMode = 'file';
    let isFileLoaded = false;
    let lastNoteTime = 0;

    // Initialisation VexFlow (Portée vide)
    notationManager.init();
    
    // Initialisation état des boutons au chargement
    updateButtonStates();

    // ============================================================
    // PARTIE 1 : LOGIQUE UI & BOUTONS
    // ============================================================

    // 1. Changement de la liste déroulante
    audioSourceSelect.addEventListener("change", (e) => {
        currentMode = e.target.value;
        // Reset complet lors du changement de source
        resetGeneratorState();
        updateButtonStates();
    });

    // 2. Gestion stricte des états des boutons (La logique demandée)
    function updateButtonStates() {
        // Bouton Sélectionner Fichier : Grisé sauf si mode "file"
        if (currentMode === 'file') {
            btnSelectFile.disabled = false;
        } else {
            btnSelectFile.disabled = true;
        }

        // Bouton Play : 
        // - Si Fichier : Enabled seulement si un fichier est chargé
        // - Si Micro/HP : Toujours Enabled par défaut
        if (currentMode === 'file') {
            btnPlay.disabled = !isFileLoaded; 
        } else {
            btnPlay.disabled = false;
        }
    }

    // 3. Bouton "Sélectionner Fichier" -> Ouvre l'explorateur
    btnSelectFile.addEventListener("click", () => {
        // Force le clic sur l'input hidden
        fileInput.click();
    });

    // 4. Une fois le fichier choisi via l'explorateur
    fileInput.addEventListener("change", async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileNameDisplay.textContent = file.name;
            
            // Chargement audio
            const duration = await audioEngine.loadFile(file);
            
            // Mise à jour UI
            totalTimeSpan.textContent = formatTime(duration);
            progressBar.max = duration;
            
            isFileLoaded = true;
            updateButtonStates(); // Active le bouton Play
        }
    });

    // 5. Bouton Play (Flip/Flop Start)
    btnPlay.addEventListener("click", async () => {
        // Initialisation Audio Context (requis par navigateur)
        if (audioEngine.audioContext.state === 'suspended') {
            await audioEngine.audioContext.resume();
        }

        // --- GESTION ETATS BOUTONS (Play -> Stop) ---
        btnPlay.disabled = true;
        btnStop.disabled = false;
        btnExport.disabled = true;       // Export désactivé pendant lecture
        audioSourceSelect.disabled = true; // On ne change pas de source pendant lecture
        btnSelectFile.disabled = true;   // On ne change pas de fichier pendant lecture

        // Callbacks moteur
        audioEngine.onNoteDetected = (freq) => {
            const now = Date.now();
            if (now - lastNoteTime > 150) { 
                notationManager.addNote(freq);
                lastNoteTime = now;
            }
        };

        audioEngine.onTimeUpdate = (time) => {
            if (currentMode === 'file') {
                progressBar.value = time;
                currentTimeSpan.textContent = formatTime(time);
            }
        };

        // Fin automatique
        audioEngine.onEnded = () => {
            handleStopLogic();
        };

        // Démarrage selon mode
        if (currentMode === 'file') {
            audioEngine.playFileSource();
        } else if (currentMode === 'mic') {
            await audioEngine.setupMicrophone();
            audioEngine.startStreamAnalysis();
        } else if (currentMode === 'system') {
            const success = await audioEngine.setupSystemAudio();
            if (!success) {
                handleStopLogic(); // Annulation user
            } else {
                audioEngine.startStreamAnalysis();
            }
        }
    });

    // 6. Bouton Stop (Flip/Flop End)
    btnStop.addEventListener("click", () => {
        handleStopLogic();
    });

    // Fonction centralisée d'arrêt pour gérer les états
    function handleStopLogic() {
        audioEngine.stop();
        
        // --- GESTION ETATS BOUTONS (Stop -> Play & Export) ---
        btnPlay.disabled = false;      // Play redevient cliquable
        btnStop.disabled = true;       // Stop se désactive
        btnExport.disabled = false;    // Export s'active ENFIN
        audioSourceSelect.disabled = false;
        
        // Rétablissement bouton fichier si mode fichier
        if (currentMode === 'file') {
            btnSelectFile.disabled = false;
        }
    }

    // 7. Bouton Export (Seulement actif après Stop)
    btnExport.addEventListener("click", () => {
        notationManager.exportToPDF();
    });

    // ============================================================
    // PARTIE 2 : LOGIQUE ENREGISTREUR (FLIP/FLOP INDÉPENDANT)
    // ============================================================

    btnRecStart.addEventListener("click", async () => {
        const success = await audioEngine.startRecordingSystem();
        if (success) {
            // FLIP : Start désactivé, Stop activé
            btnRecStart.disabled = true;
            btnRecStop.disabled = false;
            
            recorderStatus.style.display = "block";
            recorderStatus.textContent = "🔴 Enregistrement en cours...";
            recorderStatus.style.color = "#C0392B";
        }
    });

    btnRecStop.addEventListener("click", async () => {
        const blob = await audioEngine.stopRecordingAndGetBlob();
        
        // FLOP : Stop désactivé, Start activé
        btnRecStop.disabled = true;
        btnRecStart.disabled = false;

        if (blob) {
            recorderStatus.textContent = "Sauvegarde en cours...";
            // Appel Explorateur pour sauvegarde
            await saveRecordedFile(blob);
        } else {
            recorderStatus.textContent = "Erreur ou annulation.";
        }
    });

    async function saveRecordedFile(blob) {
        // API Moderne "Save As"
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'mon-enregistrement.webm',
                    types: [{
                        description: 'Fichier Audio',
                        accept: { 'audio/webm': ['.webm', '.mp3', '.wav', '.ogg'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                recorderStatus.textContent = "✅ Sauvegardé !";
            } catch (err) {
                recorderStatus.textContent = "Sauvegarde annulée.";
            }
        } else {
            // Fallback
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = "audio-capture.webm";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            recorderStatus.textContent = "✅ Téléchargé (Dossier Downloads).";
        }
        
        setTimeout(() => recorderStatus.style.display = "none", 4000);
    }

    // ============================================================
    // UTILITAIRES
    // ============================================================

    function resetGeneratorState() {
        audioEngine.stop();
        isFileLoaded = false;
        fileNameDisplay.textContent = "Aucun fichier";
        btnExport.disabled = true;
        btnStop.disabled = true;
        progressBar.value = 0;
        currentTimeSpan.textContent = "00:00";
        totalTimeSpan.textContent = "00:00";
    }

    function formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
    }
});
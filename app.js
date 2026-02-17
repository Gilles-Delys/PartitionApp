/**
 * MAIN APP
 * Orchestre l'interface et les moteurs audio.
 */

document.addEventListener("DOMContentLoaded", () => {
    
    // Initialisation des classes
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

    let currentMode = 'file';
    let lastNoteTime = 0;

    // Dessiner la portée vide au démarrage
    notationManager.init();

    // ============================================================
    // PARTIE 1 : LOGIQUE GÉNÉRATEUR PARTITION
    // ============================================================

    // 1. Gestion du changement de source
    audioSourceSelect.addEventListener("change", (e) => {
        currentMode = e.target.value;
        resetGeneratorUI();
        
        if (currentMode === 'file') {
            // Mode Fichier : On doit choisir un fichier avant de jouer
            btnSelectFile.style.display = "inline-flex";
            fileNameDisplay.style.display = "inline";
            btnPlay.innerHTML = "▶ Play";
            btnPlay.disabled = true; 
        } else {
            // Mode Micro ou Système : On peut jouer tout de suite
            btnSelectFile.style.display = "none";
            fileNameDisplay.style.display = "none";
            btnPlay.innerHTML = "▶ Play / Capturer";
            btnPlay.disabled = false; // Correction : Activé immédiatement
        }
    });

    // 2. Bouton "Sélectionner Fichier" (simule le clic sur l'input caché)
    btnSelectFile.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileNameDisplay.textContent = file.name;
            
            // Chargement dans le moteur audio
            const duration = await audioEngine.loadFile(file);
            totalTimeSpan.textContent = formatTime(duration);
            progressBar.max = duration;
            btnPlay.disabled = false; // Maintenant on peut jouer
        }
    });

    // 3. Bouton Play / Capture
    btnPlay.addEventListener("click", async () => {
        // Le navigateur demande une interaction user pour l'audio
        if (audioEngine.audioContext.state === 'suspended') {
            await audioEngine.audioContext.resume();
        }

        // Gestion état boutons
        btnPlay.disabled = true;
        btnStop.disabled = false;
        btnExport.disabled = true;
        audioSourceSelect.disabled = true;

        // Configuration des callbacks (ce que fait le moteur quand il entend une note)
        audioEngine.onNoteDetected = (freq) => {
            const now = Date.now();
            if (now - lastNoteTime > 200) { // Anti-spam (max 5 notes/sec)
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

        audioEngine.onEnded = () => stopGenerator();

        // Lancement selon le mode
        if (currentMode === 'file') {
            audioEngine.playFileSource();
        } else if (currentMode === 'mic') {
            await audioEngine.setupMicrophone();
            audioEngine.startStreamAnalysis();
        } else if (currentMode === 'system') {
            const success = await audioEngine.setupSystemAudio();
            if (!success) stopGenerator(); // Si l'user annule le partage
            else audioEngine.startStreamAnalysis();
        }
    });

    btnStop.addEventListener("click", stopGenerator);

    function stopGenerator() {
        audioEngine.stop();
        btnPlay.disabled = false;
        btnStop.disabled = true;
        btnExport.disabled = false; // On peut exporter maintenant
        audioSourceSelect.disabled = false;
    }

    btnExport.addEventListener("click", () => {
        notationManager.exportToPDF();
    });

    // ============================================================
    // PARTIE 2 : LOGIQUE ENREGISTREUR AUDIO INDÉPENDANT
    // ============================================================

    btnRecStart.addEventListener("click", async () => {
        const success = await audioEngine.startRecordingSystem();
        if (success) {
            btnRecStart.disabled = true;
            btnRecStop.disabled = false;
            recorderStatus.style.display = "block";
            recorderStatus.textContent = "🔴 Enregistrement en cours...";
            recorderStatus.style.color = "#C0392B";
        }
    });

    btnRecStop.addEventListener("click", async () => {
        const blob = await audioEngine.stopRecordingAndGetBlob();
        
        btnRecStart.disabled = false;
        btnRecStop.disabled = true;
        recorderStatus.textContent = "Traitement du fichier...";

        if (blob) {
            // Méthode moderne : Boîte de dialogue "Enregistrer sous"
            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: 'mon-enregistrement.webm',
                        types: [{
                            description: 'Fichier Audio',
                            accept: {
                                'audio/webm': ['.webm', '.mp3', '.wav'],
                            },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    recorderStatus.textContent = "✅ Fichier sauvegardé avec succès !";
                    recorderStatus.style.color = "green";
                } catch (err) {
                    recorderStatus.textContent = "Sauvegarde annulée.";
                }
            } else {
                // Méthode classique (Téléchargement direct)
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.style.display = "none";
                a.href = url;
                a.download = "enregistrement.webm"; 
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                recorderStatus.textContent = "✅ Fichier téléchargé (Dossier Downloads).";
                recorderStatus.style.color = "green";
            }
        }
        
        setTimeout(() => {
            recorderStatus.style.display = "none";
        }, 5000);
    });

    // ============================================================
    // UTILITAIRES
    // ============================================================

    function resetGeneratorUI() {
        audioEngine.stop();
        btnPlay.disabled = true;
        btnStop.disabled = true;
        btnExport.disabled = true;
        progressBar.value = 0;
        currentTimeSpan.textContent = "00:00";
    }

    function formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
    }
});
document.addEventListener("DOMContentLoaded", () => {
    console.log(">>> APP.JS DÉMARRÉ !"); // Vérifie la console (F12) si tu ne vois pas ça

    // Instanciation
    const audioEngine = new AudioEngine();
    const notationManager = new NotationManager("canvasContainer");

    // UI Elements
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

    const btnRecStart = document.getElementById("btnRecStart");
    const btnRecStop = document.getElementById("btnRecStop");
    const recorderStatus = document.getElementById("recorderStatus");

    let currentMode = 'file';
    let isFileLoaded = false;
    let lastNoteTime = 0;

    // Initialisation
    notationManager.init();
    
    // On force l'état initial des boutons par JS pour être sûr
    refreshButtonsState();

    // --- LOGIQUE SOURCE ---
    audioSourceSelect.addEventListener("change", (e) => {
        console.log("Changement source:", e.target.value);
        currentMode = e.target.value;
        resetGenerator();
        refreshButtonsState();
    });

    // --- LOGIQUE FICHIER ---
    // Note: Le HTML a déjà un onclick="fileInput.click()" au cas où, mais on le garde ici
    btnSelectFile.addEventListener("click", () => {
        console.log("Ouverture explorateur demandée");
        fileInput.click();
    });

    fileInput.addEventListener("change", async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            console.log("Fichier choisi:", file.name);
            fileNameDisplay.textContent = file.name;
            const duration = await audioEngine.loadFile(file);
            totalTimeSpan.textContent = formatTime(duration);
            progressBar.max = duration;
            isFileLoaded = true;
            refreshButtonsState();
        }
    });

    // --- LOGIQUE PLAY / STOP (FLIP FLOP) ---
    btnPlay.addEventListener("click", async () => {
        console.log("Click Play");
        if (audioEngine.audioContext.state === 'suspended') await audioEngine.audioContext.resume();

        // UI Flip
        setPlayState(true);

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

        audioEngine.onEnded = () => {
            console.log("Fin audio");
            setPlayState(false);
        };

        if (currentMode === 'file') audioEngine.playFileSource();
        else if (currentMode === 'mic') {
            await audioEngine.setupMicrophone();
            audioEngine.startStreamAnalysis();
        } else if (currentMode === 'system') {
            const ok = await audioEngine.setupSystemAudio();
            if(!ok) setPlayState(false);
            else audioEngine.startStreamAnalysis();
        }
    });

    btnStop.addEventListener("click", () => {
        console.log("Click Stop");
        audioEngine.stop();
        setPlayState(false);
    });

    btnExport.addEventListener("click", () => {
        notationManager.exportToPDF();
    });

    // --- LOGIQUE ENREGISTREUR (FLIP FLOP INDÉPENDANT) ---
    // Initialisation état enregistreur
    btnRecStart.disabled = false;
    btnRecStop.disabled = true;

    btnRecStart.addEventListener("click", async () => {
        console.log("Click Rec Start");
        const success = await audioEngine.startRecordingSystem();
        if (success) {
            btnRecStart.disabled = true;
            btnRecStop.disabled = false;
            recorderStatus.style.display = "block";
            recorderStatus.textContent = "🔴 Enregistrement en cours...";
        }
    });

    btnRecStop.addEventListener("click", async () => {
        console.log("Click Rec Stop");
        const blob = await audioEngine.stopRecordingAndGetBlob();
        
        btnRecStop.disabled = true;
        btnRecStart.disabled = false;

        if (blob) {
            recorderStatus.textContent = "Sauvegarde...";
            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: 'rec.webm',
                        types: [{ description: 'Audio', accept: { 'audio/webm': ['.webm'] } }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    recorderStatus.textContent = "Sauvegardé !";
                } catch (e) { recorderStatus.textContent = "Annulé"; }
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.style.display = "none";
                a.href = url;
                a.download = "rec.webm";
                document.body.appendChild(a);
                a.click();
                recorderStatus.textContent = "Téléchargé !";
            }
        }
    });

    // --- FONCTIONS ETATS UI ---
    
    function setPlayState(isPlaying) {
        if (isPlaying) {
            btnPlay.disabled = true;
            btnStop.disabled = false;
            btnExport.disabled = true;
            audioSourceSelect.disabled = true;
            btnSelectFile.disabled = true;
        } else {
            btnPlay.disabled = false; // Sera revérifié par refreshButtonsState
            btnStop.disabled = true;
            btnExport.disabled = false;
            audioSourceSelect.disabled = false;
            refreshButtonsState(); // Rétablit la logique selon le mode
        }
    }

    function refreshButtonsState() {
        // Logique "Qui a le droit d'être cliqué ?"
        if (currentMode === 'file') {
            btnSelectFile.disabled = false;
            // Play actif seulement si fichier chargé
            btnPlay.disabled = !isFileLoaded;
        } else {
            btnSelectFile.disabled = true;
            // Play toujours actif en mode micro/système
            btnPlay.disabled = false;
        }
        
        // Stop toujours désactivé au repos
        btnStop.disabled = true;
    }

    function resetGenerator() {
        audioEngine.stop();
        isFileLoaded = false;
        fileNameDisplay.textContent = "Aucun fichier";
        progressBar.value = 0;
        currentTimeSpan.textContent = "00:00";
    }

    function formatTime(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec < 10 ? '0'+sec : sec}`;
    }
});
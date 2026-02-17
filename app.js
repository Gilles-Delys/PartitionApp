/**
 * MAIN APP
 * Logique d'interaction UI.
 */

const audioEngine = new AudioEngine();
const notationManager = new NotationManager("canvasContainer");

// Éléments UI
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

let currentMode = 'file';
let audioDuration = 0;
let lastNoteTime = 0;

// Initialisation VexFlow
notationManager.init();

// --- Gestion des Événements ---

audioSourceSelect.addEventListener("change", (e) => {
    currentMode = e.target.value;
    resetUI();
    
    if (currentMode === 'file') {
        btnSelectFile.style.display = "inline-block";
        fileNameDisplay.style.display = "inline";
        btnPlay.innerText = "▶ Play";
    } else {
        btnSelectFile.style.display = "none";
        fileNameDisplay.style.display = "none";
        btnPlay.innerText = "🔴 Démarrer Capture";
        btnPlay.disabled = false; // Toujours actif pour micro/système
    }
});

btnSelectFile.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        fileNameDisplay.textContent = file.name;
        
        // Charger le fichier pour analyse
        audioDuration = await audioEngine.loadFile(file);
        
        // Mise à jour UI Temps
        totalTimeSpan.textContent = formatTime(audioDuration);
        progressBar.max = audioDuration;
        btnPlay.disabled = false;
    }
});

btnPlay.addEventListener("click", async () => {
    // Activer le contexte audio (nécessaire sur clic utilisateur)
    if (audioEngine.audioContext.state === 'suspended') {
        await audioEngine.audioContext.resume();
    }

    btnPlay.disabled = true;
    btnStop.disabled = false;
    btnExport.disabled = true;
    audioSourceSelect.disabled = true;

    // Callbacks du moteur audio
    audioEngine.onNoteDetected = (freq) => {
        // Filtrage temporel simple (éviter 100 notes/seconde)
        const now = Date.now();
        if (now - lastNoteTime > 250) { // Max 4 notes par seconde pour la démo
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
        stopAction();
    };

    // Démarrage selon la source
    if (currentMode === 'file') {
        audioEngine.playFileSource();
    } else if (currentMode === 'mic') {
        await audioEngine.setupMicrophone();
        audioEngine.startStreamAnalysis();
    } else if (currentMode === 'system') {
        await audioEngine.setupSystemAudio();
        audioEngine.startStreamAnalysis();
    }
});

btnStop.addEventListener("click", stopAction);

function stopAction() {
    audioEngine.stop();
    btnPlay.disabled = false;
    btnStop.disabled = true;
    btnExport.disabled = false; // Active l'export
    audioSourceSelect.disabled = false;
}

btnExport.addEventListener("click", () => {
    notationManager.exportToPDF();
});

// --- Utilitaires ---

function resetUI() {
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
/**
 * AUDIO ENGINE
 * Gère les sources audio (Fichier, Micro, Système) et l'analyse.
 */

class AudioEngine {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.source = null;
        this.stream = null;
        this.buffer = null;
        this.isProcessing = false;
        
        // Callbacks pour renvoyer les données à l'interface
        this.onNoteDetected = null; 
        this.onTimeUpdate = null;
        this.onEnded = null;
    }

    async loadFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        this.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
        return this.buffer.duration;
    }

    async setupMicrophone() {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.source.connect(this.analyser);
    }

    async setupSystemAudio() {
        // Attention: capture tout l'audio du système (via partage d'écran)
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);
            // On connecte aussi à la sortie pour entendre ce qui se passe
            this.source.connect(this.audioContext.destination);
        } catch (err) {
            console.error("Erreur capture système:", err);
            alert("L'accès à l'audio système a été refusé ou n'est pas supporté.");
        }
    }

    playFileSource(startTime = 0) {
        if (!this.buffer) return;
        
        // Création de la source tampon
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.buffer;
        
        // Connexion : Source -> Analyser -> Sortie (Haut-parleurs)
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.source.start(0, startTime);
        this.isProcessing = true;
        
        this.source.onended = () => {
            this.isProcessing = false;
            if (this.onEnded) this.onEnded();
        };

        this._startAnalysisLoop();
    }

    startStreamAnalysis() {
        this.isProcessing = true;
        this._startAnalysisLoop();
    }

    stop() {
        this.isProcessing = false;
        if (this.source) {
            try { this.source.stop(); } catch(e) {}
            this.source.disconnect();
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    // Boucle d'analyse (Pitch Detection simplifiée)
    _startAnalysisLoop() {
        if (!this.isProcessing) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        // Algorithme d'auto-corrélation simple pour trouver la fréquence
        const frequency = this._autoCorrelate(dataArray, this.audioContext.sampleRate);

        if (frequency > -1 && this.onNoteDetected) {
            this.onNoteDetected(frequency);
        }

        // Mise à jour temps (approximatif pour le flux)
        if (this.onTimeUpdate && this.audioContext.state === 'running') {
            this.onTimeUpdate(this.audioContext.currentTime);
        }

        requestAnimationFrame(() => this._startAnalysisLoop());
    }

    _autoCorrelate(buf, sampleRate) {
        // Implémentation basique de détection de pitch
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            let val = (buf[i] - 128) / 128;
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);
        if (rms < 0.01) return -1; // Trop silencieux

        let r1 = 0, r2 = size - 1, thres = 0.2;
        for (let i = 0; i < size / 2; i++) {
            if (Math.abs(buf[i] - 128) < thres) { r1 = i; break; }
        }
        for (let i = 1; i < size / 2; i++) {
            if (Math.abs(buf[size - i] - 128) < thres) { r2 = size - i; break; }
        }
        buf = buf.slice(r1, r2);
        size = buf.length;

        let c = new Array(size).fill(0);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size - i; j++) {
                c[i] = c[i] + ((buf[j] - 128) / 128) * ((buf[j + i] - 128) / 128);
            }
        }
        let d = 0; while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < size; i++) {
            if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
        }
        let T0 = maxpos;
        return sampleRate / T0;
    }
}
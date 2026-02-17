/**
 * AUDIO ENGINE
 * Gère l'analyse (Transcription) et l'enregistrement (Recorder).
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
        
        // Variables pour l'enregistreur indépendant (Partie 2)
        this.mediaRecorder = null;
        this.recordedChunks = [];
        
        // Callbacks vers l'interface
        this.onNoteDetected = null; 
        this.onTimeUpdate = null;
        this.onEnded = null;
    }

    // --- PARTIE 1 : MOTEUR DE TRANSCRIPTION ---

    async loadFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        // On décode
        this.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
        return this.buffer.duration;
    }

    async setupMicrophone() {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.source.connect(this.analyser);
    }

    async setupSystemAudio() {
        try {
            // Capture audio système (via partage d'écran avec audio coché)
            this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            
            // Vérification si l'utilisateur a bien partagé l'audio
            const audioTracks = this.stream.getAudioTracks();
            if (audioTracks.length === 0) {
                alert("Attention : Vous n'avez pas coché 'Partager l'audio système'. L'audio ne sera pas détecté.");
                this.stop();
                return false;
            }

            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);
            this.source.connect(this.audioContext.destination); // Retour audio pour entendre
            return true;
        } catch (err) {
            console.error("Erreur capture système:", err);
            return false;
        }
    }

    playFileSource(startTime = 0) {
        if (!this.buffer) return;
        
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.buffer;
        // Connexions
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

    // Boucle d'analyse de fréquence (Pitch Detection)
    _startAnalysisLoop() {
        if (!this.isProcessing) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        const frequency = this._autoCorrelate(dataArray, this.audioContext.sampleRate);

        if (frequency > -1 && this.onNoteDetected) {
            this.onNoteDetected(frequency);
        }

        if (this.onTimeUpdate && this.audioContext.state === 'running') {
            this.onTimeUpdate(this.audioContext.currentTime);
        }

        requestAnimationFrame(() => this._startAnalysisLoop());
    }

    _autoCorrelate(buf, sampleRate) {
        // Algorithme simple d'autocorrélation pour trouver la fréquence fondamentale
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            let val = (buf[i] - 128) / 128;
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);
        if (rms < 0.01) return -1; // Silence

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

    // --- PARTIE 2 : ENREGISTREUR INDÉPENDANT ---

    async startRecordingSystem() {
        try {
            // Demande de partage d'écran avec audio
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            
            // On ne garde que la piste audio
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) throw new Error("Pas d'audio partagé");

            const audioStream = new MediaStream(audioTracks);
            
            // Codecs préférés
            const options = { mimeType: 'audio/webm;codecs=opus' };
            
            this.mediaRecorder = new MediaRecorder(audioStream, options);
            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            return true;
        } catch (err) {
            console.error("Erreur démarrage enregistrement:", err);
            return false;
        }
    }

    async stopRecordingAndGetBlob() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) return resolve(null);

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                // Tout arrêter proprement
                if(this.mediaRecorder.stream) {
                    this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
                this.mediaRecorder = null;
                resolve(blob);
            };

            this.mediaRecorder.stop();
        });
    }
}
class AudioEngine {
    constructor() {
        // Initialisation sécurisée
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.source = null;
        this.stream = null;
        this.buffer = null;
        this.isProcessing = false;
        
        this.mediaRecorder = null;
        this.recordedChunks = [];
        
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
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const audioTracks = this.stream.getAudioTracks();
            if (audioTracks.length === 0) {
                alert("Aucun audio détecté. Avez-vous coché 'Partager l'audio' ?");
                this.stop();
                return false;
            }
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);
            this.source.connect(this.audioContext.destination);
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    playFileSource(startTime = 0) {
        if (!this.buffer) return;
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.buffer;
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

    _startAnalysisLoop() {
        if (!this.isProcessing) return;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        const frequency = this._autoCorrelate(dataArray, this.audioContext.sampleRate);
        if (frequency > -1 && this.onNoteDetected) this.onNoteDetected(frequency);
        if (this.onTimeUpdate && this.audioContext.state === 'running') this.onTimeUpdate(this.audioContext.currentTime);

        requestAnimationFrame(() => this._startAnalysisLoop());
    }

    _autoCorrelate(buf, sampleRate) {
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            let val = (buf[i] - 128) / 128;
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);
        if (rms < 0.01) return -1; 

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

    // --- ENREGISTREUR ---
    async startRecordingSystem() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) throw new Error("Pas d'audio");

            const audioStream = new MediaStream(audioTracks);
            this.mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
            this.mediaRecorder.start();
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    async stopRecordingAndGetBlob() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) return resolve(null);
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                this.mediaRecorder = null;
                resolve(blob);
            };
            this.mediaRecorder.stop();
        });
    }
}
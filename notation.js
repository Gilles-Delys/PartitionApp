class NotationManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.notes = []; 
        this.VF = Vex.Flow;
        this.context = null;
    }

    init() {
        try {
            const div = document.getElementById(this.containerId);
            div.innerHTML = ""; 
            const renderer = new this.VF.Renderer(div, this.VF.Renderer.Backends.SVG);
            renderer.resize(800, 250);
            this.context = renderer.getContext();
            this.drawStave();
        } catch (e) {
            console.error("Erreur VexFlow:", e);
        }
    }

    drawStave() {
        this.context.clear();
        const stave = new this.VF.Stave(10, 40, 750);
        stave.addClef("treble").addTimeSignature("4/4");
        stave.setContext(this.context).draw();
    }

    freqToNote(frequency) {
        const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const semitones = 12 * (Math.log(frequency / 440) / Math.log(2));
        const midifile = 69 + Math.round(semitones); 
        return { note: noteStrings[midifile % 12], octave: Math.floor(midifile / 12) - 1 };
    }

    transposeToClarinetBb(noteObj) {
        const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        let idx = noteStrings.indexOf(noteObj.note) + 2; // +1 Ton
        let newOctave = noteObj.octave;
        if (idx >= 12) { idx -= 12; newOctave += 1; }
        return { keys: [`${noteStrings[idx]}/${newOctave}`], duration: "q" };
    }

    addNote(frequency) {
        if (this.notes.length > 12) this.notes.shift(); 
        const rawNote = this.freqToNote(frequency);
        if (!rawNote.note) return;
        const transposed = this.transposeToClarinetBb(rawNote);
        this.notes.push(new this.VF.StaveNote({ keys: transposed.keys, duration: transposed.duration, clef: "treble" }));
        this.draw();
    }

    draw() {
        const div = document.getElementById(this.containerId);
        div.innerHTML = ""; 
        const renderer = new this.VF.Renderer(div, this.VF.Renderer.Backends.SVG);
        renderer.resize(800, 250);
        const ctx = renderer.getContext();
        const stave = new this.VF.Stave(10, 40, 750).addClef("treble").addTimeSignature("4/4").setContext(ctx).draw();
        if (this.notes.length > 0) {
            const voice = new this.VF.Voice({num_beats: this.notes.length, beat_value: 4});
            voice.addTickables(this.notes);
            new this.VF.Formatter().joinVoices([voice]).format([voice], 700);
            voice.draw(ctx, stave);
        }
    }

    async exportToPDF() {
        const element = document.getElementById(this.containerId);
        const canvas = await html2canvas(element);
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'mm', 'a4'); 
        pdf.text("Partition Clarinette Sib", 10, 15);
        const props = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (props.height * pdfWidth) / props.width;
        pdf.addImage(imgData, 'PNG', 0, 30, pdfWidth, pdfHeight);
        pdf.save("ma-partition.pdf");
    }
}
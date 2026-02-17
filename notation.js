/**
 * NOTATION MANAGER
 * Gère la conversion Fréquence -> Note et le rendu VexFlow.
 */

class NotationManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.notes = []; // Stocke les notes détectées
        this.VF = Vex.Flow;
        this.context = null;
        this.stave = null;
        this.group = null; // Groupe SVG pour nettoyage facile
    }

    init() {
        const div = document.getElementById(this.containerId);
        div.innerHTML = ""; // Reset
        const renderer = new this.VF.Renderer(div, this.VF.Renderer.Backends.SVG);
        renderer.resize(800, 200);
        this.context = renderer.getContext();
        
        // Création de la portée
        this.stave = new this.VF.Stave(10, 40, 750);
        this.stave.addClef("treble").addTimeSignature("4/4");
        this.stave.setContext(this.context).draw();
    }

    // Convertit une fréquence en Note (ex: 440 -> A4)
    freqToNote(frequency) {
        const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const A4 = 440;
        const semitones = 12 * (Math.log(frequency / A4) / Math.log(2));
        const midifile = 69 + Math.round(semitones); // MIDI number
        
        const noteIndex = midifile % 12;
        const octave = Math.floor(midifile / 12) - 1;
        
        return {
            note: noteStrings[noteIndex],
            octave: octave,
            midi: midifile
        };
    }

    // Transposition pour Clarinette Sib (On ajoute 2 demi-tons à la note entendue)
    transposeToClarinetBb(noteObj) {
        const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        
        // Index actuel
        let idx = noteStrings.indexOf(noteObj.note);
        let newOctave = noteObj.octave;

        // Ajouter 2 demi-tons (Ton entier)
        idx += 2;
        if (idx >= 12) {
            idx -= 12;
            newOctave += 1;
        }

        return {
            keys: [`${noteStrings[idx]}/${newOctave}`],
            duration: "q" // Par défaut noire (quarter) pour la démo temps réel
        };
    }

    addNote(frequency) {
        // Évite d'ajouter trop de notes (filtrage basique)
        if (this.notes.length > 12) this.notes.shift(); // Garde les 12 dernières

        const rawNote = this.freqToNote(frequency);
        const transposedNote = this.transposeToClarinetBb(rawNote);
        
        // Création objet VexFlow
        const vfNote = new this.VF.StaveNote({ 
            keys: transposedNote.keys, 
            duration: transposedNote.duration,
            clef: "treble" 
        });

        this.notes.push(vfNote);
        this.draw();
    }

    draw() {
        // Effacer les notes précédentes (astuce SVG simple ou gestion de groupe)
        // Pour VexFlow simple, on redessine souvent tout le canvas ou on utilise un groupe.
        // Ici, on fait un reset simple pour la démo dynamique.
        const div = document.getElementById(this.containerId);
        div.innerHTML = ""; 
        const renderer = new this.VF.Renderer(div, this.VF.Renderer.Backends.SVG);
        renderer.resize(800, 250);
        const ctx = renderer.getContext();
        
        const stave = new this.VF.Stave(10, 40, 750);
        stave.addClef("treble").addTimeSignature("4/4").setContext(ctx).draw();

        if (this.notes.length > 0) {
            // Créer des voix (Voice)
            const voice = new this.VF.Voice({num_beats: this.notes.length,  beat_value: 4});
            voice.addTickables(this.notes);
            
            // Formater et dessiner
            new this.VF.Formatter().joinVoices([voice]).format([voice], 700);
            voice.draw(ctx, stave);
        }
    }

    async exportToPDF() {
        const element = document.getElementById(this.containerId);
        // Utilise html2canvas pour capturer le SVG/Canvas
        const canvas = await html2canvas(element);
        const imgData = canvas.toDataURL('image/png');
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape
        
        pdf.setFontSize(20);
        pdf.text("Partition Clarinette Sib", 10, 15);
        
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 0, 30, pdfWidth, pdfHeight);
        pdf.save("ma-partition.pdf");
    }
}
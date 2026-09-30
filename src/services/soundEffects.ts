/**
 * Web Audio API synthesizer for instant barcode scanner beep
 * Zero latency, no external mp3 assets required.
 */
export function playBarcodeBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    // Classic POS scanner pitch (1800 Hz)
    osc.frequency.setValueAtTime(1800, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (err) {
    console.debug('Audio context beep prevented or not allowed yet:', err);
  }
}

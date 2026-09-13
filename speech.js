/* Language-matched narration with cancellation-safe audio ducking. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SonuSpeech = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const female = /female|heera|neerja|swara|kalpana|aditi|raveena|veena|lekha|priya/i;
  function pickVoice(voices, language) {
    const exact = language === 'hi' ? 'hi-in' : 'en-in';
    const matching = voices.filter(v => v.lang.replace(/_/g, '-').toLowerCase() === exact);
    const pool = matching.length ? matching : (language === 'hi' ? voices.filter(v => /^hi(?:-|$)/i.test(v.lang)) : []);
    return pool.find(v => female.test(v.name)) || pool[0] || null;
  }
  function spoken(text, language) {
    return text.replace(/₹\s?([\d,]+)/g, (_, n) => `${n.replace(/,/g, '')} ${language === 'hi' ? 'रुपये' : 'rupees'}`)
      .replace(/EMI/g, language === 'hi' ? 'ई एम आई' : 'E M I');
  }
  function create({ synth, Utterance, audio, setTalking, setStatus, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let generation = 0, timer = null, active = null;
    function cancel() {
      generation++;
      clearTimer(timer);
      active = null;
      if (audio) {
        audio.onended = audio.onerror = audio.onplaying = null;
        audio.pause();
      }
      if (synth) synth.cancel();
      setTalking(false);
    }
    function speak(text, language, recording) {
      cancel();
      const id = generation;
      if (audio && recording) {
        audio.src = recording;
        audio.volume = 1;
        setTalking(true);
        setStatus(language === 'hi' ? 'हिंदी · अनन्या की आवाज़' : 'Indian English · Ananya’s voice');
        const done = () => {
          if (id !== generation) return;
          clearTimer(timer);
          setTalking(false);
        };
        const failed = () => {
          if (id !== generation) return;
          audio.pause();
          done();
          setStatus(language === 'hi' ? 'आवाज़ नहीं चल पाई। फिर सुनें दबाएँ।' : 'Audio could not play. Select Replay to try again.');
        };
        audio.onplaying = () => { if (id === generation) { clearTimer(timer); setTalking(true); } };
        audio.onended = done;
        audio.onerror = failed;
        timer = setTimer(failed, 30000);
        try { audio.play().catch(failed); } catch { failed(); }
        return;
      }
      const voice = synth && pickVoice(synth.getVoices(), language);
      if (!voice || !Utterance) {
        setStatus(language === 'hi'
          ? 'इस उपकरण पर हिंदी की आवाज़ उपलब्ध नहीं है। कृपया नीचे दिया गया संदेश पढ़ें।'
          : 'An Indian English voice is not available on this device. You can read the message below.');
        return;
      }
      setStatus(language === 'hi' ? 'हिंदी · सुनने के लिए फिर सुनें दबाएँ' : 'Indian English · Select Replay to listen again');
      const u = new Utterance(spoken(text, language));
      active = u; // Retain the utterance until playback completes.
      u.voice = voice;
      u.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
      u.rate = language === 'hi' ? 0.9 : 0.94;
      u.pitch = 1;
      u.volume = 1;
      const done = () => {
        if (id !== generation || active !== u) return;
        clearTimer(timer);
        active = null;
        setTalking(false);
      };
      u.onstart = () => { if (id === generation && active === u) setTalking(true); };
      u.onend = done;
      u.onerror = () => {
        if (id !== generation || active !== u) return;
        done();
        setStatus(language === 'hi' ? 'आवाज़ नहीं चल पाई। फिर सुनें दबाएँ या संदेश पढ़ें।' : 'Voice playback was interrupted. Select Replay or read the message.');
      };
      // Silence surf before queuing speech, not after the first spoken syllable.
      setTalking(true);
      try { synth.speak(u); } catch { u.onerror(); return; }
      // Some devices omit completion events. Restore ambience when their queue is idle.
      const check = () => {
        if (id !== generation || active !== u) return;
        if (!synth.speaking && !synth.pending) done();
        else timer = setTimer(check, 1000);
      };
      timer = setTimer(check, 1500);
    }
    return { speak, cancel };
  }
  return { create, pickVoice, spoken };
});

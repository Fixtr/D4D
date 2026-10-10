#pragma once

enum class LedFeedback { OFF, RECORDING, COMPLETED, RETRY };
const uint8_t FEEDBACK_LED_PINS[] = {PIN_LED1, PIN_LED2, PIN_LED3, PIN_LED4};
LedFeedback ledFeedback = LedFeedback::OFF;
uint32_t ledFeedbackStarted = 0, lastLedFrame = 0, maxLedFrameGap = 0;
float ledTrail[4] = {};

void setLedFeedback(LedFeedback feedback, uint32_t now) {
  ledFeedback = feedback;
  ledFeedbackStarted = now;
  for (uint8_t i=0;i<4;++i) ledTrail[i]=0;
}

void initLedFeedback() {
  analogWriteResolution(8);
  for (uint8_t pin : FEEDBACK_LED_PINS) {
    pinMode(pin, OUTPUT);
    analogWrite(pin,255); // This connected NU40 revision has active-LOW LEDs.
  }
  lastLedFrame = millis();
}

void updateLedFeedback(uint32_t now) {
  const uint32_t frameGap = now-lastLedFrame;
  if (frameGap<5) return;
  if (frameGap>maxLedFrameGap) maxLedFrameGap=frameGap;
  lastLedFrame=now;
  const uint32_t elapsed = now-ledFeedbackStarted;
  float brightness[4] = {};
  if (ledFeedback==LedFeedback::COMPLETED) {
    // One smooth collective bloom, then all LEDs off.
    if (elapsed>=900) ledFeedback=LedFeedback::OFF;
    else {
      const float phase=(float)elapsed/900.0f;
      const float envelope=sinf(phase*PI);
      for (uint8_t i=0;i<4;++i) brightness[i]=envelope;
    }
  } else if (ledFeedback==LedFeedback::RECORDING || ledFeedback==LedFeedback::RETRY) {
    const bool retry=ledFeedback==LedFeedback::RETRY;
    if (retry && elapsed>=1600) {
      // Persistent low glow identifies a retry even if the animation was missed.
      const float glow=0.12f+0.06f*(0.5f+0.5f*sinf((elapsed-1600)*2*PI/2000.0f));
      brightness[0]=brightness[3]=glow;
    } else {
      const uint32_t travel=retry?140:200;
      const uint32_t pause=retry?60:400;
      const uint32_t leg=travel+pause;
      const uint32_t phase=elapsed%(2*leg);
      const bool returning=phase>=leg;
      const uint32_t legTime=returning?phase-leg:phase;
      const float progress=legTime<travel?(float)legTime/travel:1.0f;
      const float position=3*(returning?1-progress:progress);
      const float decay=powf(0.75f,(float)frameGap/5.0f);
      for (uint8_t i=0;i<4;++i) {
        const float distance=fabsf(position-i);
        const float head=distance<1?1-distance:0;
        ledTrail[i]*=decay;
        if (head>ledTrail[i]) ledTrail[i]=head;
        if (distance>=1.25f || ledTrail[i]<0.05f) ledTrail[i]=0;
        brightness[i]=ledTrail[i];
      }
    }
  }
  for (uint8_t i=0;i<4;++i) {
    // Head/tail intensity is already weighted; keep persistent retry glow visible.
    const float level=ledFeedback==LedFeedback::RETRY && elapsed>=1600 ? brightness[i] : brightness[i]*brightness[i];
    analogWrite(FEEDBACK_LED_PINS[i],255-(uint8_t)(255*level+0.5f));
  }
}

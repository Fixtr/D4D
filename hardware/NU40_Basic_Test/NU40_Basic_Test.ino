#include <Arduino.h>
#include <Adafruit_TinyUSB.h>
#include <Wire.h>
#include <Haptic_Driver.h>

const uint8_t LED_PINS[] = { PIN_LED1, PIN_LED2, PIN_LED3, PIN_LED4 };
const size_t LED_COUNT = sizeof(LED_PINS) / sizeof(LED_PINS[0]);
const uint32_t TRAVEL_MS = 200;
const uint32_t PAUSE_MS = 400;
const uint32_t FRAME_MS = 5;
const float TRAIL_DECAY = 0.75f;
float afterglow[LED_COUNT] = {};
uint32_t animationStarted, lastLedFrame, maxLedGap;

Haptic_Driver haptic;
bool hapticReady = false;
bool repeatHaptic = true;
bool manualPulse = false;
uint8_t hapticState = 0; // 0: idle, 1: first pulse, 2: gap, 3: second pulse
uint32_t lastHapticStart, hapticStateStarted;

int readHapticRegister(uint8_t reg) {
  Wire.beginTransmission(0x4A);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((uint8_t)0x4A, (uint8_t)1) != 1) return -1;
  return Wire.read();
}

void updateLeds(uint32_t now) {
  const uint32_t elapsed = now - lastLedFrame;
  if (elapsed < FRAME_MS) return;
  if (elapsed > maxLedGap) maxLedGap = elapsed;
  lastLedFrame = now;
  const uint32_t legDuration = TRAVEL_MS + PAUSE_MS;
  const uint32_t phase = (now - animationStarted) % (2 * legDuration);
  const bool returning = phase >= legDuration;
  const uint32_t legTime = returning ? phase - legDuration : phase;
  const float progress = legTime < TRAVEL_MS ? (float)legTime / TRAVEL_MS : 1.0f;
  const float position = (LED_COUNT - 1) * (returning ? 1.0f - progress : progress);
  for (size_t i = 0; i < LED_COUNT; i++) {
    float distance = position - (float)i;
    if (distance < 0) distance = -distance;
    const float head = distance < 1.0f ? 1.0f - distance : 0.0f;
    afterglow[i] *= TRAIL_DECAY;
    if (head > afterglow[i]) afterglow[i] = head;
    if (distance >= 1.25f || afterglow[i] < 0.05f) afterglow[i] = 0.0f;
    const uint8_t brightness = (uint8_t)(255.0f * afterglow[i] * afterglow[i] + 0.5f);
    analogWrite(LED_PINS[i], 255 - brightness); // Active LOW LEDs.
  }
}

bool setHaptic(uint8_t level) {
  if (haptic.setVibrate(level)) return true;
  haptic.setVibrate(0);
  haptic.setOperationMode(0);
  hapticReady = false;
  hapticState = 0;
  return false;
}

void updateHaptic(uint32_t now) {
  if (!hapticReady) return;
  const uint32_t elapsed = now - hapticStateStarted;
  if (hapticState == 0) {
    if (manualPulse || (repeatHaptic && (uint32_t)(now - lastHapticStart) >= 2000)) {
      manualPulse = false;
      if (!setHaptic(20)) return;
      lastHapticStart = hapticStateStarted = millis();
      hapticState = 1;
    }
  } else if (hapticState == 1 && elapsed >= 100) {
    if (!setHaptic(0)) return;
    hapticStateStarted = millis();
    hapticState = 2;
  } else if (hapticState == 2 && elapsed >= 200) {
    if (!setHaptic(20)) return;
    hapticStateStarted = millis();
    hapticState = 3;
  } else if (hapticState == 3 && elapsed >= 100) {
    if (!setHaptic(0)) return;
    hapticState = 0;
  }
}

void handleCommands() {
  if (!Serial.available()) return;
  const char command = Serial.read();
  if (command == 'v') manualPulse = true;
  if (command == 'r') repeatHaptic = true;
  if (command == 'x') {
    repeatHaptic = manualPulse = false;
    if (hapticReady) setHaptic(0);
    hapticState = 0;
  }
  if (command == 's' && Serial && Serial.availableForWrite() >= 80) {
    Serial.print("HAPTIC ready="); Serial.print(hapticReady);
    Serial.print(" repeat="); Serial.print(repeatHaptic);
    Serial.print(" state="); Serial.print(hapticState);
    Serial.print(" LED max gap ms="); Serial.println(maxLedGap);
    maxLedGap = 0;
  }
}

void setup() {
  Serial.begin(115200); // Keep automatic 1200-bps USB bootloader entry.
  Wire.begin();
  Wire.setClock(100000);
  analogWriteResolution(8);
  for (size_t i = 0; i < LED_COUNT; i++) {
    pinMode(LED_PINS[i], OUTPUT);
    analogWrite(LED_PINS[i], 255);
  }
  // Configure once at startup, not during each vibration cycle.
  if (readHapticRegister(0) == 0xBA) {
    haptic.begin(Wire);
    hapticReady = haptic.setOperationMode(0) && haptic.defaultMotor() &&
        haptic.setActuatorABSVolt(1.0f) && haptic.setActuatorNOMVolt(1.0f) &&
        haptic.setVibrate(0) && haptic.setOperationMode(DRO_MODE);
    if (!hapticReady) { haptic.setVibrate(0); haptic.setOperationMode(0); }
  }
  animationStarted = lastLedFrame = lastHapticStart = millis();
}

void loop() {
  updateLeds(millis());
  updateHaptic(millis());
  handleCommands();
  yield();
}

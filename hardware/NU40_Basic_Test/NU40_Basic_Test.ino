#include <Arduino.h>
#include <Adafruit_TinyUSB.h>
#include <Wire.h>
#include <Haptic_Driver.h>
#include <bluefruit.h>
BLEUart bleuart;

Haptic_Driver haptic;
bool hapticReady = false;
bool repeatHaptic = false;
bool manualPulse = false;
uint8_t hapticState = 0; // 0: idle, 1: pulse, 2: gap
uint8_t hapticPulseCount = 2, hapticPulsesDone = 0;
uint16_t hapticOnMs = 120, hapticGapMs = 160;
uint32_t lastHapticStart, hapticStateStarted;

int readHapticRegister(uint8_t reg) {
  Wire.beginTransmission(0x4A);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((uint8_t)0x4A, (uint8_t)1) != 1) return -1;
  return Wire.read();
}

void reportHaptic(const char* message) {
  // BLE carries only the recording protocol; diagnostics stay on USB.
  if (Serial && Serial.availableForWrite() >= 32) Serial.println(message);
}

bool checkHapticFault() {
  const int irq = readHapticRegister(0x03);
  if (irq >= 0 && !(irq & 0xDA)) return true;
  haptic.setVibrate(0);
  haptic.setOperationMode(0);
  hapticReady = false;
  hapticState = 0;
  reportHaptic("ERROR HAPTIC_DRIVER_FAULT");
  return false;
}

bool setHaptic(uint8_t level) {
  if (haptic.setVibrate(level)) return true;
  reportHaptic("ERROR HAPTIC_I2C");
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
      if (!checkHapticFault() || !setHaptic(40)) return;
      reportHaptic("HAPTIC STARTED");
      hapticPulsesDone = 0;
      lastHapticStart = hapticStateStarted = millis();
      hapticState = 1;
    }
  } else if (hapticState == 1 && elapsed >= hapticOnMs) {
    if (!checkHapticFault() || !setHaptic(0)) return;
    hapticStateStarted = millis();
    ++hapticPulsesDone;
    if (Serial) {
      Serial.print("HAPTIC PULSE "); Serial.print(hapticPulsesDone);
      Serial.print(" t="); Serial.println(now);
    }
    hapticState = hapticPulsesDone >= hapticPulseCount ? 0 : 2;
    if (!hapticState) reportHaptic("HAPTIC DRIVE_COMPLETED");
  } else if (hapticState == 2 && elapsed >= hapticGapMs) {
    if (!setHaptic(40)) return;
    hapticStateStarted = millis();
    hapticState = 1;
  }
}

void printHapticStatus(Print& out) {
  char status[160];
  snprintf(status, sizeof(status),
      "STATUS HAPTIC_%s\nDRIVER irq=0x%02X warn=0x%02X mode=0x%02X output=%d nominal=%d absolute=%d\n",
      hapticReady ? "READY" : "OFFLINE", readHapticRegister(0x03),
      readHapticRegister(0x04), readHapticRegister(0x22),
      readHapticRegister(0x23), readHapticRegister(0x0C), readHapticRegister(0x0D));
  out.print(status); // One buffered write prevents BLE TX queue overflow.
}
#include "LedFeedback.h"
#include "RecordingProtocol.h"
#include "ImuTest.h"

void handleCommands() {
  if (!Serial.available() && !bleuart.available()) return;
  const bool fromBle = bleuart.available();
  const char command = fromBle ? bleuart.read() : Serial.read();
  if (fromBle) { receiveRecordingCommand(command, millis()); return; }
  if (command == 'g') requestRecording(millis()); // USB integration-test trigger.
  if (!fromBle && command == 'i') { printImuInfo(); imuStreaming = true; }
  if (!fromBle && command == 'o') imuStreaming = false;
  if (command == 'v') {
    hapticPulseCount = 2; hapticOnMs = 120; hapticGapMs = 160;
    manualPulse = true;
  }
  if (command == 'h') repeatHaptic = true;
  if (command == 'x') {
    repeatHaptic = manualPulse = false;
    if (hapticReady) setHaptic(0);
    hapticState = 0;
  }
  if (command == 'd' && Serial && Serial.availableForWrite() >= 80) {
    Serial.print("RECORD state="); Serial.println(recordingStateName());
    Serial.print("LED feedback="); Serial.print((uint8_t)ledFeedback);
    Serial.print(" max frame gap ms="); Serial.println(maxLedFrameGap);
    maxLedFrameGap=0;
    printHapticStatus(Serial);
    Serial.print("HAPTIC ready="); Serial.print(hapticReady);
    Serial.print(" repeat="); Serial.print(repeatHaptic);
    Serial.print(" state="); Serial.print(hapticState);
    Serial.println();
    Serial.print("BLE adv="); Serial.print(Bluefruit.Advertising.isRunning());
    Serial.print(" connected="); Serial.println(Bluefruit.connected());
    char name[32] = {}; Bluefruit.getName(name, sizeof(name)); Serial.println(name);
  }
}

void setup() {
  Serial.begin(115200); // Keep automatic 1200-bps USB bootloader entry.
  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);
  Bluefruit.begin();
  Bluefruit.autoConnLed(false);
  Bluefruit.setName("NU40-BLE-Test");
  Bluefruit.setTxPower(4);
  bleuart.begin();
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 32); // Keep test discovery responsive.
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
  Wire.begin();
  Wire.setClock(100000);
  initLedFeedback();
  // Configure once at startup, not during each vibration cycle.
  if (readHapticRegister(0) == 0xBA) {
    haptic.begin(Wire);
    hapticReady = haptic.setOperationMode(0) && haptic.defaultMotor() &&
        haptic.enableFreqTrack(false) &&
        haptic.setVibrate(0);
    // The driver stays powered across MCU uploads; clear latched events while idle.
    if (hapticReady) {
      haptic.clearIrq(0xFF);
      hapticReady = haptic.setOperationMode(DRO_MODE) && checkHapticFault();
    }
    if (!hapticReady) { haptic.setVibrate(0); haptic.setOperationMode(0); }
  }
  initImus();
  lastHapticStart = millis();
}

void loop() {
  updateLedFeedback(millis());
  updateHaptic(millis());
  handleCommands();
  updateRecording(millis());
  updateImus(millis());
  yield();
}

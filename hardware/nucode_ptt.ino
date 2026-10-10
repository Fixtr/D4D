/*
 * T4-2 핸즈프리 음성 온디바이스 전술 AI - 무선 전술 PTT 펌웨어
 * Target: NUCODE 무선 개발보드 (ESP32 호환)
 * Library: ESP32 BLE Keyboard (https://github.com/T-vK/ESP32-BLE-Keyboard)
 * 
 * 동작 원리:
 * 1. 단말기(노트북/스마트폰)와 Bluetooth BLE HID 키보드로 자동 페어링
 * 2. 전술 버튼(GPIO 4)을 누르고 있는 동안(HOLD) -> 'Space' 키 DOWN 전송 & LED ON
 * 3. 버튼을 떼면(RELEASE) -> 'Space' 키 UP 전송 & LED OFF
 * 4. 바운싱 방지(Debounce) 및 저전력 대기 모드 구현
 */

#include <BleKeyboard.h>

// 핀 매핑 (NUCODE 보드 핀아웃에 맞게 조정 가능)
const int PTT_BUTTON_PIN = 4;   // 택트 스위치 입력 핀 (내부 풀업 사용)
const int STATUS_LED_PIN = 2;   // 상태 표시 LED 핀 (전송 중 점등)

// BLE 장치명 (전술 호출부호 형태로 노출)
BleKeyboard bleKeyboard("NUCODE-PTT-EAGLE1", "EDTH-D4D", 100);

// 디바운스 및 버튼 상태 변수
int lastButtonState = HIGH;
int currentButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 25; // 25ms 디바운스

void setup() {
  Serial.begin(115200);
  Serial.println("[NUCODE TACTICAL PTT] 초기화 시작...");

  // 핀 모드 설정
  pinMode(PTT_BUTTON_PIN, INPUT_PULLUP); // 스위치 누를 시 LOW로 떨어짐
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // BLE 키보드 브로드캐스팅 시작
  bleKeyboard.begin();
  Serial.println("[NUCODE TACTICAL PTT] BLE HID 키보드 모드 대기 중 (장치명: NUCODE-PTT-EAGLE1)");
}

void loop() {
  // BLE 연결 상태 확인
  if (bleKeyboard.isConnected()) {
    int reading = digitalRead(PTT_BUTTON_PIN);

    // 버튼 입력 변화 감지 시 디바운스 타이머 갱신
    if (reading != lastButtonState) {
      lastDebounceTime = millis();
    }

    if ((millis() - lastDebounceTime) > debounceDelay) {
      // 버튼 상태가 실제로 확정된 경우
      if (reading != currentButtonState) {
        currentButtonState = reading;

        if (currentButtonState == LOW) {
          // [버튼 누름 - PTT ACTIVE]
          Serial.println("[PTT] >> 버튼 눌림 (HOLD): Space Key Press");
          digitalWrite(STATUS_LED_PIN, HIGH);
          bleKeyboard.press(' '); // 스페이스바 DOWN 유지
        } else {
          // [버튼 뗌 - PTT RELEASE]
          Serial.println("[PTT] << 버튼 뗌 (RELEASE): Space Key Release");
          digitalWrite(STATUS_LED_PIN, LOW);
          bleKeyboard.release(' '); // 스페이스바 UP 해제
        }
      }
    }

    lastButtonState = reading;
  } else {
    // 미연결 상태일 때 LED 느린 깜빡임 (페어링 대기 안내)
    unsigned long currentMillis = millis();
    if ((currentMillis / 500) % 2 == 0) {
      digitalWrite(STATUS_LED_PIN, HIGH);
    } else {
      digitalWrite(STATUS_LED_PIN, LOW);
    }
  }

  delay(5); // CPU 점유율 최적화
}

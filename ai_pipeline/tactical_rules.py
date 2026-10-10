"""
규칙(정규식) 기반 전술 보고 필드 추출기
형식이 뚜렷한 값(MGRS 좌표, 인원 수, 화기, 방향, 탄약 %, 부상자 수 등)을
무전 인식 텍스트에서 즉시 추출한다. LLM을 거치지 않으므로 칸 배치가 틀리지 않고
원문에 없는 값을 만들지 않는다. 찾지 못한 칸은 "식별 불가".

규칙 근거: T4-2_Voice_First_Tactical_AI_Guide.md 4.1 / API_CONTRACT.md 2
"""
import re
from typing import Callable, Dict, List

UNKNOWN = "식별 불가"
THREAT_LEVELS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

# 보고 종류별 data 필수 키와 스크립트 표기용 한글 라벨 (API_CONTRACT.md 2)
REPORT_FIELDS: Dict[str, Dict[str, str]] = {
    "SALUTE": {
        "size": "S 적 규모",
        "activity": "A 적 활동/기동방향",
        "location": "L 위치/좌표(MGRS)",
        "unit": "U 적 소속/복장/식별",
        "time": "T 발견 일시",
        "equipment": "E 장비/화기",
    },
    "SITREP": {
        "unit_status": "부대 상태",
        "location": "아군 위치",
        "ammo_supply": "탄약/보급 잔여량",
        "casualties": "부상자 현황",
        "operational_status": "작전 상황",
    },
    "9-Line MEDEVAC": {
        "line1_location": "Line 1 위치",
        "line2_freq_callsign": "Line 2 주파수/호출부호",
        "line3_patients_precedence": "Line 3 환자 수/긴급도",
        "line4_special_equipment": "Line 4 특수장비",
        "line5_patient_type": "Line 5 환자 유형",
        "line6_security": "Line 6 보안",
        "line7_marking": "Line 7 표식",
        "line8_patient_nationality": "Line 8 국적",
        "line9_cbrn": "Line 9 CBRN",
    },
}

# ---------------------------------------------------------------------------
# 보고 종류 / 위협수준 판별
# ---------------------------------------------------------------------------
# 명시적 후송 요청·응급 상황은 항상 MEDEVAC, 부상자 언급만 있으면 SITREP 단서가 없을 때만 MEDEVAC
MEDEVAC_KEYWORDS = ("메디백", "MEDEVAC", "의무후송", "후송", "출혈", "지혈")
CASUALTY_KEYWORDS = ("부상자", "부상", "환자")
SITREP_KEYWORDS = ("SITREP", "상황보고", "상황 보고", "탄약", "보급", "식수", "고지 확보", "점령", "아군 위치",
                   "작전 가능", "작전 불가", "전투 가능", "진지 구축")
HIGH_THREAT_KEYWORDS = ("RPG", "전차", "기갑", "대전차", "박격포", "포격", "교전", "사격", "매복", "드론")
# "부상자 없음" 등 부정 표현은 MEDEVAC 판별에서 제외
NEGATED_PATTERN = re.compile(r"(부상자|부상|환자|사상자)\s*(없음|없다|없습니다|0\s*명)")


def classify_report_type(transcript: str) -> str:
    """발화 키워드로 보고 종류 판별 (생명과 직결되는 MEDEVAC 우선)"""
    text = NEGATED_PATTERN.sub("", transcript).upper()
    if any(k.upper() in text for k in MEDEVAC_KEYWORDS):
        return "9-Line MEDEVAC"
    if any(k.upper() in text for k in SITREP_KEYWORDS):
        return "SITREP"
    if any(k in text for k in CASUALTY_KEYWORDS):
        return "9-Line MEDEVAC"
    return "SALUTE"


def classify_threat(report_type: str, transcript: str) -> str:
    """부상자 후송 CRITICAL, 적 화기·기갑·교전 HIGH, 적 관측 MEDIUM, 그 외 LOW"""
    if report_type == "9-Line MEDEVAC":
        return "CRITICAL"
    if any(k.upper() in transcript.upper() for k in HIGH_THREAT_KEYWORDS):
        return "HIGH"
    if report_type == "SALUTE":
        return "MEDIUM"
    return "LOW"


# ---------------------------------------------------------------------------
# 공통 패턴
# ---------------------------------------------------------------------------
# 고유어 수사(세 명)와 STT가 자주 내는 한자어 수사(일문, 이대)
_NATIVE_NUMS = {"한": 1, "하나": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4,
                "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10,
                "일": 1, "이": 2, "삼": 3, "사": 4, "오": 5, "육": 6, "칠": 7, "팔": 8, "구": 9, "십": 10}
NUM = r"(\d+|하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|열|일|이|삼|사|오|육|칠|팔|구|십)"

MGRS_RE = re.compile(r"(?<![0-9A-Za-z])(\d{1,2}[C-HJ-NP-X])[\s-]*([A-HJ-NP-Z]{2})[\s-]*(\d{2,5})[\s-]*(\d{2,5})(?![0-9])", re.I)
# 구역 번호가 잘못 인식된 좌표 (예: "OESDH-1102-9940") → 100km 격자 + 좌표값만 보존
PARTIAL_MGRS_RE = re.compile(r"(?<![A-Za-z])[A-Z]*?([A-HJ-NP-Z]{2})[\s-]*(\d{3,5})[\s-]+(\d{3,5})(?![0-9])", re.I)
RELATIVE_LOC_RE = re.compile(r"(좌전방|우전방|전방|후방|좌측|우측)\s*(\d+|백|이백|삼백|오백|천)\s*(m|미터|km|킬로미터|킬로)(?![가-힣A-Za-z])", re.I)
_DIST_WORDS = {"백": "100", "이백": "200", "삼백": "300", "오백": "500", "천": "1000"}
HILL_RE = re.compile(r"(\d+)\s*\.?\s*고지")
TERRAIN_RE = re.compile(r"(?<![가-힣])((?:북동|북서|남동|남서|북|남|동|서)쪽\s*)?(능선|계곡|교량|마을|도로|숲|건물|해안|고개|교차로)")
LZ_RE = re.compile(r"LZ\s*([가-힣A-Za-z0-9]+)", re.I)
DIRECTION_RE = re.compile(r"(?<![가-힣])(북동|북서|남동|남서|북|남|동|서)(쪽|방향|방면)")
CLOCK_RE = re.compile(r"(\d{1,2})\s*시\s*방향")
TIME_RE = re.compile(r"(?<!\d)(\d{1,2})\s*(?:시|:)\s*(\d{1,2})\s*분?(?!\s*방향)|(?<!\d)(\d{1,2})\s*시(?!\s*방향)(?!\d)")
NOW_RE = re.compile(r"(방금|지금|현재)")


def _num(token: str) -> str:
    return str(_NATIVE_NUMS.get(token, token))


def _join(values: List[str]) -> str:
    seen: List[str] = []
    for v in values:
        v = re.sub(r"\s+", " ", v).strip(" ,.")
        if v and v not in seen:
            seen.append(v)
    return ", ".join(seen) if seen else UNKNOWN


def _clauses(transcript: str) -> List[str]:
    """쉼표·마침표 단위 구절 (호출부호와 '오버/이상' 같은 절차 용어는 제외)"""
    parts = [c.strip() for c in re.split(r"[,.!?\n]", transcript)]
    return [c for c in parts if c and not c.startswith("여기는") and c not in ("오버", "이상")]


def extract_mgrs(t: str) -> str:
    return _join([f"{a.upper()} {b.upper()} {c} {d}" for a, b, c, d in MGRS_RE.findall(t)])


def extract_location(t: str) -> str:
    """MGRS 좌표 > 상대 위치(전방 100m) > 고지 > 지형"""
    found = [f"{a.upper()} {b.upper()} {c} {d}" for a, b, c, d in MGRS_RE.findall(t)]
    if not found:
        found += [f"{grid.upper()} {e} {n} (구역 미상)" for grid, e, n in PARTIAL_MGRS_RE.findall(t)]
    found += [f"{side} {_DIST_WORDS.get(dist, dist)}{unit}" for side, dist, unit in RELATIVE_LOC_RE.findall(t)]
    found += [f"{n}고지" for n in HILL_RE.findall(t)]
    found += [f"{h}시 방향" for h in CLOCK_RE.findall(t)]
    found += [f"{d}{terrain}" for d, terrain in TERRAIN_RE.findall(t)]
    return _join(found)


def extract_direction(t: str) -> str:
    found = [f"{d}쪽" for d, _ in DIRECTION_RE.findall(t)]
    found += [f"{h}시 방향" for h in CLOCK_RE.findall(t)]
    return _join(found)


def extract_time(t: str) -> str:
    found = []
    for h, m, h_only in TIME_RE.findall(t):
        if h:
            found.append(f"{int(h):02d}:{int(m):02d} 경")
        elif h_only:
            found.append(f"{int(h):02d}:00 경")
    found += [f"{w} (보고 시점)" for w in NOW_RE.findall(t)[:1]]
    return _join(found)


# ---------------------------------------------------------------------------
# SALUTE
# ---------------------------------------------------------------------------
SIZE_RE = re.compile(r"(적\s*)?(보병|무장\s*병력|무장병|병력|인원|저격수|전차|장갑차|차량|트럭|드론|헬기)\s*" + NUM + r"\s*(명|대|기)")
WEAPON_RE = re.compile(r"(RPG(?:-?7)?|대전차\s*화기|대전차\s*미사일|저격총|기관총|소총|박격포|로켓|전차|장갑차|드론|수류탄|급조\s*폭발물|IED|지뢰)"
                       r"(?:\s*" + NUM + r"\s*(문|정|대|기|발|개))?", re.I)
ACTIVITY_RE = re.compile(r"(이동|기동|접근|철수|후퇴|매복|사격|정찰|집결|설치|은폐|대기|교전|포격|침투|도주|배치)")
ENEMY_UNIT_RE = re.compile(r"(신형\s*위장복|위장복|전투복|민간인\s*복장|사복|특수부대|정규군|민병대|[가-힣A-Za-z0-9]+\s*소속)")


def extract_size(t: str) -> str:
    found = []
    for enemy, noun, n, unit in SIZE_RE.findall(t):
        noun = re.sub(r"\s+", " ", noun)
        found.append(f"{'적 ' if enemy else ''}{noun} {_num(n)}{unit}")
    return _join(found)


def extract_equipment(t: str) -> str:
    found = []
    for weapon, n, unit in WEAPON_RE.findall(t):
        weapon = re.sub(r"\s+", " ", weapon)
        weapon = weapon.upper() if weapon.isascii() else weapon
        found.append(f"{weapon} {_num(n)}{unit}" if n else weapon)
    return _join(found)


def extract_activity(t: str) -> str:
    verbs = ACTIVITY_RE.findall(t)
    if not verbs:
        return UNKNOWN
    direction = extract_direction(t)
    lead = f"{direction} " if direction != UNKNOWN else ""
    return f"{lead}{_join(verbs)} 중"


def extract_enemy_unit(t: str) -> str:
    return _join(ENEMY_UNIT_RE.findall(t))


# ---------------------------------------------------------------------------
# SITREP
# ---------------------------------------------------------------------------
UNIT_STATUS_RE = re.compile(r"((?:작전|전투)\s*(?:가능|불가)|이상\s*없음|특이사항\s*없음)")
SUPPLY_RE = re.compile(r"(?:잔여\s*)?(탄약|실탄|식수|식량|연료|배터리|보급)\s*(?:잔여\s*)?"
                       r"(\d+\s*(?:%|퍼센트)|\d+\s*일\s*분|부족|충분|없음)")
CASUALTY_RE = re.compile(r"((?:아군|적군|적)\s*)?(부상자|사상자|전사자|부상|환자)\s*"
                         r"((?:" + NUM[1:-1] + r")\s*명|없음|없다|없습니다)")
OPS_RE = re.compile(r"(확보|점령|완료|구축|진입|돌파|경계|철수|대기|진지|도착)")


def extract_unit_status(t: str) -> str:
    return _join(UNIT_STATUS_RE.findall(t))


def extract_supply(t: str) -> str:
    found = []
    for item, amount in SUPPLY_RE.findall(t):
        amount = re.sub(r"\s+", "", amount).replace("퍼센트", "%")
        found.append(f"{item} {amount}")
    return _join(found)


def extract_casualties(t: str) -> str:
    found = []
    for side, kind, status in CASUALTY_RE.findall(t):
        m = re.match(NUM + r"\s*명", status)
        status = f"{_num(m.group(1))}명" if m else "없음"
        found.append(f"{side.strip() + ' ' if side else ''}{kind} {status}")
    return _join(found)


def extract_operational_status(t: str) -> str:
    return _join([c for c in _clauses(t) if OPS_RE.search(c)])


# ---------------------------------------------------------------------------
# 9-Line MEDEVAC
# ---------------------------------------------------------------------------
FREQ_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(MHz|메가헤르츠|메가)", re.I)
# 호출부호는 한 단어 + 선택적 번호 (예: "독수리 하나", "1분대")
CALLSIGN_RE = re.compile(r"여기는\s*([가-힣A-Za-z0-9]+(?:\s+(?:하나|둘|셋|넷|다섯|\d+))?)")
PATIENT_RE = re.compile(r"(부상자|환자)\s*" + NUM + r"\s*명")
PRECEDENCE = (("긴급", "긴급(Urgent)"), ("급박", "긴급(Urgent)"), ("우선", "우선(Priority)"),
              ("일상", "일상(Routine)"), ("일반", "일상(Routine)"))
SPECIAL_EQUIP_RE = re.compile(r"(호이스트|인양\s*장비|인공호흡기|산소)")
PATIENT_TYPE_RE = re.compile(r"(들것|보행\s*(?:가능|불가)|걸을\s*수\s*(?:있음|없음|있다|없다))")
SECURITY_RE = re.compile(r"(적\s*(?:없음|없다)|안전함?|적\s*접촉\s*중?|교전\s*중|적\s*(?:출현|근접))")
MARKING_RE = re.compile(r"((?:적색|황색|녹색|백색|보라색|빨간|노란)\s*)?(연막(?:탄)?|패널|섬광등?|스트로브|적외선|IR)", re.I)
NATIONALITY_RE = re.compile(r"(아군|한국군|국군|미군|민간인|포로|적군)")
CBRN_RE = re.compile(r"((?:화학|생물|방사능|방사선|핵|CBRN)(?:\s*(?:오염|위협|공격))?(?:\s*없음)?)", re.I)


def extract_medevac_location(t: str) -> str:
    found = [f"{a.upper()} {b.upper()} {c} {d}" for a, b, c, d in MGRS_RE.findall(t)]
    found += [f"LZ {name}" for name in LZ_RE.findall(t)]
    return _join(found) if found else extract_location(t)



def extract_freq_callsign(t: str) -> str:
    found = [f"{f} MHz" for f, _ in FREQ_RE.findall(t)]
    found += [f"호출부호 {c.strip()}" for c in CALLSIGN_RE.findall(t)[:1]]
    return " / ".join(found) if found else UNKNOWN


def extract_patients(t: str) -> str:
    count = [f"환자 {_num(n)}명" for _, n in PATIENT_RE.findall(t)]
    precedence = [label for word, label in PRECEDENCE if word in t]
    return _join(count[:1] + precedence[:1])


def extract_marking(t: str) -> str:
    return _join([f"{color.strip() + ' ' if color else ''}{mark}" for color, mark in MARKING_RE.findall(t)])


# ---------------------------------------------------------------------------
# 보고 종류별 추출 테이블
# ---------------------------------------------------------------------------
EXTRACTORS: Dict[str, Dict[str, Callable[[str], str]]] = {
    "SALUTE": {
        "size": extract_size,
        "activity": extract_activity,
        "location": extract_location,
        "unit": extract_enemy_unit,
        "time": extract_time,
        "equipment": extract_equipment,
    },
    "SITREP": {
        "unit_status": extract_unit_status,
        "location": extract_location,
        "ammo_supply": extract_supply,
        "casualties": extract_casualties,
        "operational_status": extract_operational_status,
    },
    "9-Line MEDEVAC": {
        "line1_location": extract_medevac_location,
        "line2_freq_callsign": extract_freq_callsign,
        "line3_patients_precedence": extract_patients,
        "line4_special_equipment": lambda t: _join(SPECIAL_EQUIP_RE.findall(t)),
        "line5_patient_type": lambda t: _join(PATIENT_TYPE_RE.findall(t)),
        "line6_security": lambda t: _join(SECURITY_RE.findall(t)),
        "line7_marking": extract_marking,
        "line8_patient_nationality": lambda t: _join(NATIONALITY_RE.findall(t)),
        "line9_cbrn": lambda t: _join(CBRN_RE.findall(t)),
    },
}


def normalize_transcript(transcript: str) -> str:
    """STT 표기 흔들림 보정 ("3.고지" → "3고지")"""
    return re.sub(r"(\d)\s*\.\s*(고지)", r"\1\2", transcript)


def extract_fields(report_type: str, transcript: str) -> Dict[str, str]:
    t = normalize_transcript(transcript)
    return {key: fn(t) for key, fn in EXTRACTORS[report_type].items()}


# ---------------------------------------------------------------------------
# 복창(Read-back)
# ---------------------------------------------------------------------------
READBACK_KEYS = {
    "SALUTE": ("size", "activity", "equipment"),
    "SITREP": ("location", "operational_status", "ammo_supply", "casualties"),
    "9-Line MEDEVAC": ("line1_location", "line3_patients_precedence", "line7_marking"),
}


def template_read_back_summary(report_type: str, data: Dict[str, str], transcript: str) -> str:
    """추출된 필드로 만든 복창 요약 (LLM 미사용·실패 시 대체)"""
    values = {k: data[k] for k in READBACK_KEYS[report_type] if data.get(k, UNKNOWN) != UNKNOWN}
    if report_type == "SALUTE" and "equipment" in values:
        values["equipment"] = f"{values['equipment']} 식별"
    # 다른 항목에 이미 포함된 값은 생략 ("3고지" ⊂ "3고지 확보 완료")
    parts = list(values.values())
    parts = [p for i, p in enumerate(parts) if not any(p != q and p.split(" 식별")[0] in q for q in parts)]
    return ", ".join(parts) if parts else ", ".join(_clauses(transcript))


def format_read_back(report_type: str, summary: str) -> str:
    """복창 문장을 '... {보고종류} 보고를 전파합니까?' 형태로 고정"""
    summary = summary.strip().strip("\"'“”").rstrip("?.!。… ")
    summary = re.sub(r"[^.?!]*전파합니까$", "", summary).strip().rstrip(".,")
    prefix = f"{summary}. " if summary else ""
    return f"{prefix}{report_type} 보고를 전파합니까?"


def is_grounded(text: str, transcript: str) -> bool:
    """text 의 숫자가 모두 발화 원문(한글 수사 포함)에 있는지"""
    spoken = re.sub(r"\s+", "", transcript)
    spoken_nums = set(re.findall(r"\d+", spoken)) | {str(v) for k, v in _NATIVE_NUMS.items() if k in spoken}
    return all(n in spoken_nums or n in spoken for n in re.findall(r"\d+", text))

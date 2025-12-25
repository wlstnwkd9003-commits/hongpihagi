const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// =======================
// 설정
// =======================
const SETTINGS = {
  PLAYER_SIZE: 140,
  PLAYER_SPEED: 8,
  PLAYER_BOTTOM_MARGIN: 20,

  // 기본 홍 크기 (작은 홍 ~ 큰 홍, 3배)
  HONG_MIN_SIZE: 50,
  HONG_MAX_SIZE: 150,

  HITBOX_SHRINK: 14,
  BGM_VOLUME: 0.4,

  // ✅ 난이도 단계(초)
  DIFFICULTY_TIMES: [60, 90, 120, 180],

  // ✅ 단계별 홍 속도 (기본 + 랜덤)
  SPEED_BASE_BY_STAGE: [3.0, 4.5, 5.8, 6.7, 8.5],
  SPEED_RAND_BY_STAGE: [3.0, 3.8, 4.2, 5.7, 7.0],

  // ✅ 단계별 스폰 간격 (홍 더 자주)
  SPAWN_INTERVAL_BY_STAGE: [800, 720, 640, 560, 480],

  // ✅ 레벨업 텍스트 표시 시간(ms)
  LEVELUP_MS: 1000,

  // ✅ 특대 홍 등장 시간(초)
  SPECIAL_5X_TIME: 90,
  SPECIAL_15X_TIME: 150,

  // ✅ 특대 홍 속도
  SPECIAL_SPEED_BASE: 4.2,
  SPECIAL_SPEED_RAND: 2.2,

  // ✅ 스테이지 4 전용: 좌우 이동 홍 확률 & 속도
  STAGE4_SIDEWAYS_CHANCE: 0.48, // 0~1 (값 올리면 더 자주 등장)
  STAGE4_VX_MIN: 1.8,
  STAGE4_VX_MAX: 3.8
};

// =======================
// BGM
// =======================
const bgm = document.getElementById("bgm");
let bgmStarted = false;

// =======================
// 이미지
// =======================
const playerImg = new Image();
playerImg.src = "player.png";

const hongImg1 = new Image();
hongImg1.src = "hong1.png";

const hongImg2 = new Image();
hongImg2.src = "hong2.png";

// =======================
// 플레이어
// =======================
const player = {
  width: SETTINGS.PLAYER_SIZE,
  height: SETTINGS.PLAYER_SIZE,
  x: canvas.width / 2 - SETTINGS.PLAYER_SIZE / 2,
  y: canvas.height - SETTINGS.PLAYER_SIZE - SETTINGS.PLAYER_BOTTOM_MARGIN,
  speed: SETTINGS.PLAYER_SPEED
};

// =======================
// 입력 / 상태
// =======================
let leftPressed = false;
let rightPressed = false;
let gameOver = false;

// 생존 시간
let startTime = Date.now();
let survivedSeconds = 0;

// 난이도
let currentStage = 0;
let lastStage = 0;

// LEVEL UP 표시
let levelUpUntil = 0;

// 스폰
let hongs = [];
let lastSpawn = 0;

// 특대 홍 1회성 플래그
let special5xSpawned = false;
let special15xSpawned = false;

document.addEventListener("keydown", (e) => {
  // 첫 입력 시 BGM 시작
  if (!bgmStarted) {
    bgmStarted = true;
    if (bgm) {
      bgm.volume = SETTINGS.BGM_VOLUME;
      bgm.play().catch(() => {});
    }
  }

  if (e.key === "ArrowLeft") leftPressed = true;
  if (e.key === "ArrowRight") rightPressed = true;

  if ((e.key === "r" || e.key === "R") && gameOver) resetGame();
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") leftPressed = false;
  if (e.key === "ArrowRight") rightPressed = false;
});

// =======================
// 난이도 단계 계산
// =======================
function calcStage(seconds) {
  let stage = 0;
  for (let i = 0; i < SETTINGS.DIFFICULTY_TIMES.length; i++) {
    if (seconds >= SETTINGS.DIFFICULTY_TIMES[i]) stage++;
  }
  return stage;
}

function clampHongSizeToCanvas(size) {
  const maxSize = Math.min(canvas.width - 10, canvas.height - 10);
  return Math.min(size, maxSize);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// =======================
// 홍 생성 (기본 홍: 작은게 더 많이)
// =======================
function spawnHongBase() {
  // 작은 홍이 더 많이 나오도록 bias
  const t = Math.random();
  const biased = t * t;

  const sizeRaw =
    SETTINGS.HONG_MIN_SIZE +
    biased * (SETTINGS.HONG_MAX_SIZE - SETTINGS.HONG_MIN_SIZE);

  const size = clampHongSizeToCanvas(sizeRaw);
  const x = Math.random() * (canvas.width - size);

  const base =
    SETTINGS.SPEED_BASE_BY_STAGE[currentStage] ?? SETTINGS.SPEED_BASE_BY_STAGE.at(-1);
  const randSpeed =
    SETTINGS.SPEED_RAND_BY_STAGE[currentStage] ?? SETTINGS.SPEED_RAND_BY_STAGE.at(-1);

  const speed = base + Math.random() * randSpeed;

  const type = Math.random() < 0.5 ? 0 : 1;

  // ✅ 스테이지 4에서만 “좌우 이동 홍” 일부 섞기
  // stage 4 = 180초 이상
  let vx = 0;
  if (currentStage === 4 && Math.random() < SETTINGS.STAGE4_SIDEWAYS_CHANCE) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    vx = dir * rand(SETTINGS.STAGE4_VX_MIN, SETTINGS.STAGE4_VX_MAX);
  }

  hongs.push({
    x,
    y: -size,
    size,
    speed,
    type,
    special: false,
    vx // 0이면 일반 홍, 0이 아니면 좌우 이동 홍
  });
}

// =======================
// 특대 홍 생성 (90초 5배 / 150초 15배, 각각 1회)
// =======================
function spawnSpecialHong(multiplier) {
  const sizeRaw = SETTINGS.HONG_MIN_SIZE * multiplier;
  const size = clampHongSizeToCanvas(sizeRaw);

  const x = Math.max(0, (canvas.width - size) / 2);
  const speed = SETTINGS.SPECIAL_SPEED_BASE + Math.random() * SETTINGS.SPECIAL_SPEED_RAND;

  const type = 1;

  hongs.push({
    x,
    y: -size,
    size,
    speed,
    type,
    special: true,
    mult: multiplier,
    vx: 0 // 특대 홍은 좌우 이동 없음
  });
}

// =======================
// 충돌 판정
// =======================
function isColliding(playerObj, hong) {
  const s = SETTINGS.HITBOX_SHRINK;
  return (
    playerObj.x + s < hong.x + hong.size - s &&
    playerObj.x + playerObj.width - s > hong.x + s &&
    playerObj.y + s < hong.y + hong.size - s &&
    playerObj.y + playerObj.height - s > hong.y + s
  );
}

// =======================
// 업데이트
// =======================
function update(nowTs) {
  survivedSeconds = Math.floor((Date.now() - startTime) / 1000);

  // 난이도 단계 갱신
  currentStage = calcStage(survivedSeconds);

  // 단계 올라가면 LEVEL UP 표시
  if (currentStage > lastStage) {
    levelUpUntil = nowTs + SETTINGS.LEVELUP_MS;
    lastStage = currentStage;
  }

  // 특대 홍 조건
  if (!special5xSpawned && survivedSeconds >= SETTINGS.SPECIAL_5X_TIME) {
    spawnSpecialHong(5);
    special5xSpawned = true;
  }
  if (!special15xSpawned && survivedSeconds >= SETTINGS.SPECIAL_15X_TIME) {
    spawnSpecialHong(15);
    special15xSpawned = true;
  }

  // 플레이어 이동
  if (leftPressed) player.x -= player.speed;
  if (rightPressed) player.x += player.speed;

  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

  // 홍 이동 + 충돌
  for (const h of hongs) {
    h.y += h.speed;

    // ✅ 좌우 이동 홍 처리 (벽에서 튕기기)
    if (h.vx && h.vx !== 0) {
      h.x += h.vx;

      if (h.x < 0) {
        h.x = 0;
        h.vx *= -1;
      }
      if (h.x + h.size > canvas.width) {
        h.x = canvas.width - h.size;
        h.vx *= -1;
      }
    }

    if (isColliding(player, h)) gameOver = true;
  }

  // 화면 밖 제거
  hongs = hongs.filter((h) => h.y < canvas.height + h.size);
}

// =======================
// 그리기
// =======================
function draw(nowTs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 플레이어
  ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);

  // 홍
  for (const h of hongs) {
    const img = h.type === 0 ? hongImg1 : hongImg2;
    ctx.drawImage(img, h.x, h.y, h.size, h.size);
  }

  // HUD
  ctx.fillStyle = "#000";
  ctx.font = "20px Arial";
  ctx.fillText(`생존 시간 : ${survivedSeconds}초`, 10, 28);

  ctx.font = "14px Arial";
  ctx.fillText(`난이도 단계 : ${currentStage}`, 10, 48);

  // LEVEL UP 표시
  if (!gameOver && nowTs < levelUpUntil) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);

    ctx.fillStyle = "#fff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("LEVEL UP!", canvas.width / 2, canvas.height / 2 + 10);
    ctx.textAlign = "start";
  }

  // GAME OVER
  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.font = "36px Arial";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);

    ctx.font = "18px Arial";
    ctx.fillText(`생존 시간 : ${survivedSeconds}초`, canvas.width / 2, canvas.height / 2 + 25);
    ctx.fillText("R 키로 재시작", canvas.width / 2, canvas.height / 2 + 55);
    ctx.textAlign = "start";
  }
}

// =======================
// 루프
// =======================
function loop(timestamp) {
  if (!gameOver) {
    const spawnInterval =
      SETTINGS.SPAWN_INTERVAL_BY_STAGE[currentStage] ??
      SETTINGS.SPAWN_INTERVAL_BY_STAGE.at(-1);

    if (timestamp - lastSpawn > spawnInterval) {
      spawnHongBase();
      lastSpawn = timestamp;
    }

    update(timestamp);
  }

  draw(timestamp);
  requestAnimationFrame(loop);
}

// =======================
// 재시작
// =======================
function resetGame() {
  gameOver = false;

  hongs = [];
  player.x = canvas.width / 2 - player.width / 2;

  startTime = Date.now();
  survivedSeconds = 0;

  currentStage = 0;
  lastStage = 0;

  levelUpUntil = 0;
  lastSpawn = 0;

  special5xSpawned = false;
  special15xSpawned = false;
}

requestAnimationFrame(loop);
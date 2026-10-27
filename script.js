// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = "https://ksymlyhrqguwjrervnbl.supabase.co";
const SUPABASE_KEY = "sb_publishable_KnEsoB8kC9F-wHiM3SaSTw_B3cp9UJZ";

// Supabase 표에 요청을 보내는 함수
async function api(path, options = {}) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const error = new Error("Supabase 요청 실패: " + res.status);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ===== 브라우저 저장 (좋아요 한 번만) =====
function readStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 저장이 막힌 브라우저 */ }
}

// 이 브라우저의 이름표. 처음 한 번 만들어 저장해 둔다.
function getClientId() {
  let id = readStorage("resume_client_id");
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    writeStorage("resume_client_id", id);
  }
  return id;
}

// 이 브라우저에서 이미 좋아요를 누른 카드 번호 목록
function getLikedIds() {
  try { return JSON.parse(readStorage("resume_liked") || "[]"); } catch (e) { return []; }
}
function saveLikedId(projectId) {
  const ids = getLikedIds();
  if (!ids.includes(projectId)) ids.push(projectId);
  writeStorage("resume_liked", JSON.stringify(ids));
}

// ===== 작은 도우미 =====
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function setText(id, text) {
  document.getElementById(id).textContent = text || "";
}

function formatDate(value) {
  const d = new Date(value);
  return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." +
    String(d.getDate()).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.7 5c2 0 3.6 1.1 4.3 2.6h2C13.7 6.1 15.3 5 17.3 5c3.5 0 5.5 3.6 4.2 6.8C19.5 16.4 12 21 12 21z"/></svg>';

// ===== 프로필 =====
async function loadProfile() {
  const rows = await api("profile?select=*&id=eq.1");
  const p = rows[0];
  if (!p) return;

  const photo = document.getElementById("profile-photo");
  photo.textContent = "";
  if (p.photo_url) {
    const img = el("img");
    img.src = p.photo_url;
    img.alt = p.name + " 프로필 사진";
    photo.appendChild(img);
  }

  setText("profile-name", p.name);
  setText("profile-title", p.title);
  setText("profile-badge", p.career_badge);
  setText("contact-name", p.name);
  setText("contact-email", p.email);
  setText("contact-phone", p.phone);
  setText("contact-location", p.location);
  setText("profile-intro", p.intro);
  setText("profile-education", p.education);
  setText("profile-skills", p.skills);
  setText("profile-experience", p.experience);
  setText("profile-quote", p.quote ? "“" + p.quote + "”" : "");

  // 한 줄 소개: 그 안의 이름에만 파란 밑줄
  const headline = document.getElementById("profile-headline");
  headline.textContent = "";
  const text = p.headline || "";
  const at = p.name ? text.indexOf(p.name) : -1;
  if (at === -1) {
    headline.textContent = text;
  } else {
    headline.append(text.slice(0, at));
    headline.appendChild(el("span", "hl-name", p.name));
    headline.append(text.slice(at + p.name.length));
  }

  if (p.name) document.title = p.name + " | 포트폴리오";
}

// ===== 포트폴리오 카드 =====
async function loadProjects() {
  const box = document.getElementById("cards");
  const [projects, likes] = await Promise.all([
    api("projects?select=*&order=sort_order.asc,id.asc"),
    api("likes?select=project_id"),
  ]);

  // 카드별 좋아요 수 세기
  const counts = {};
  likes.forEach((row) => {
    counts[row.project_id] = (counts[row.project_id] || 0) + 1;
  });

  box.textContent = "";
  if (projects.length === 0) {
    box.appendChild(el("p", "notice", "아직 등록된 프로젝트가 없습니다."));
    return;
  }
  projects.forEach((project) => {
    box.appendChild(makeCard(project, counts[project.id] || 0));
  });
}

function makeCard(project, likeCount) {
  const card = el("article", "card");

  // 누르면 열 주소: 첨부 파일이 있으면 그것, 없으면 썸네일
  const openUrl = project.file_url || project.thumbnail_url;
  const link = el(openUrl ? "a" : "div", "card-link");
  if (openUrl) {
    link.href = openUrl;
    link.target = "_blank";
    link.rel = "noopener";
  }

  // 브라우저 창 모양 썸네일
  const thumb = el("div", "thumb");
  const bar = el("div", "thumb-bar");
  bar.append(el("span"), el("span"), el("span"));
  const view = el("div", "thumb-view");
  if (project.thumbnail_url) {
    const img = el("img");
    img.src = project.thumbnail_url;
    img.alt = project.title + " 썸네일";
    img.loading = "lazy";
    view.appendChild(img);
  }
  thumb.append(bar, view);

  const body = el("div", "card-body");
  const meta = [project.number, project.category].filter(Boolean).join(" · ");
  body.appendChild(el("p", "card-meta", meta));
  body.appendChild(el("h4", "card-title", project.title));
  body.appendChild(el("p", "card-desc", project.description));
  const tags = el("div", "tags");
  (project.tags || []).forEach((t) => tags.appendChild(el("span", "tag", t)));
  body.appendChild(tags);

  link.append(thumb, body);

  // 좋아요 버튼
  const foot = el("div", "card-foot");
  const likeBtn = el("button", "like");
  likeBtn.type = "button";
  likeBtn.innerHTML = HEART_SVG;
  const countSpan = el("span", "like-count", String(likeCount));
  likeBtn.appendChild(countSpan);
  likeBtn.setAttribute("aria-label", "좋아요");

  if (getLikedIds().includes(project.id)) likeBtn.classList.add("liked");

  likeBtn.addEventListener("click", () => likeProject(project.id, likeBtn, countSpan));
  foot.appendChild(likeBtn);

  card.append(link, foot);
  return card;
}

async function likeProject(projectId, button, countSpan) {
  if (button.classList.contains("liked") || button.disabled) return;
  button.disabled = true;
  try {
    await api("likes", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ project_id: projectId, client_id: getClientId() }),
    });
    countSpan.textContent = String(Number(countSpan.textContent) + 1);
  } catch (e) {
    // 409 = 이 브라우저가 이미 누른 카드. 숫자는 그대로 둔다.
    if (e.status !== 409) {
      button.disabled = false;
      alert("좋아요를 남기지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
      return;
    }
  }
  saveLikedId(projectId);
  button.classList.add("liked");
  button.disabled = false;
}

// ===== 방명록 =====
function makeGuestItem(row) {
  const li = el("li", "guest-item");
  const head = el("div", "guest-head");
  head.append(el("span", "guest-nick", row.nickname), el("span", "guest-date", formatDate(row.created_at)));
  li.append(head, el("p", "guest-msg", row.message));
  return li;
}

async function loadGuestbook() {
  const list = document.getElementById("guest-list");
  const rows = await api("resume_guestbook?select=*&order=created_at.desc&limit=100");
  list.textContent = "";
  if (rows.length === 0) {
    list.appendChild(el("li", "notice", "첫 번째 한마디를 남겨 주세요."));
    return;
  }
  rows.forEach((row) => list.appendChild(makeGuestItem(row)));
}

async function submitGuestbook() {
  const nickInput = document.getElementById("guest-nickname");
  const msgInput = document.getElementById("guest-message");
  const button = document.getElementById("guest-submit");
  const status = document.getElementById("guest-status");

  const nickname = nickInput.value.trim();
  const message = msgInput.value.trim();
  if (!nickname || !message) {
    status.textContent = "별명과 한마디를 모두 적어 주세요.";
    return;
  }

  button.disabled = true;
  status.textContent = "남기는 중…";
  try {
    const rows = await api("resume_guestbook", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ nickname, message }),
    });
    const list = document.getElementById("guest-list");
    const empty = list.querySelector(".notice");
    if (empty) empty.remove();
    list.prepend(makeGuestItem(rows[0]));   // 목록 맨 위에 보이기
    msgInput.value = "";
    status.textContent = "남겼습니다. 고맙습니다!";
  } catch (e) {
    status.textContent = "남기지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
  button.disabled = false;
}

document.getElementById("guest-submit").addEventListener("click", submitGuestbook);
document.getElementById("guest-message").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) submitGuestbook();
});

// ===== 시작 =====
loadProfile().catch(() => {
  setText("profile-name", "정보를 불러오지 못했습니다");
});
loadProjects().catch(() => {
  const box = document.getElementById("cards");
  box.textContent = "";
  box.appendChild(el("p", "notice", "프로젝트를 불러오지 못했습니다."));
});
loadGuestbook().catch(() => {
  const list = document.getElementById("guest-list");
  list.textContent = "";
  list.appendChild(el("li", "notice", "방명록을 불러오지 못했습니다."));
});

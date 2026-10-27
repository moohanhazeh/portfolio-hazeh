// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = "https://ksymlyhrqguwjrervnbl.supabase.co";
const SUPABASE_KEY = "sb_publishable_KnEsoB8kC9F-wHiM3SaSTw_B3cp9UJZ";
const BUCKET = "resume";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const FILE_TYPES = { ...IMAGE_TYPES, "application/pdf": "pdf" };

// ===== 로그인 정보 보관 =====
// 로그인하면 받은 토큰을 이 브라우저에 저장해 두고, 요청할 때마다 같이 보낸다.
const SESSION_KEY = "resume_admin_session";
let session = null;

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}
function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    email: data.user ? data.user.email : session && session.email,
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* 저장이 막힌 브라우저 */ }
}
function clearSession() {
  session = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
}

// ===== Supabase Auth (로그인·토큰 새로 받기·로그아웃) =====
async function authRequest(path, body, token) {
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error((data && (data.error_description || data.msg || data.message)) || "Auth 요청 실패");
    error.status = res.status;
    throw error;
  }
  return data;
}

async function signIn(email, password) {
  const data = await authRequest("token?grant_type=password", { email, password });
  saveSession(data);
}

async function refreshSession() {
  const data = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
  saveSession(data);
}

// 토큰이 1분 안에 만료되면 미리 새로 받아 둔다
async function freshToken() {
  if (!session) throw new Error("로그인이 필요해요.");
  if (session.expires_at - 60 < Date.now() / 1000) await refreshSession();
  return session.access_token;
}

// ===== 표(REST)와 보관함(Storage) 요청 =====
async function api(path, options = {}) {
  const token = await freshToken();
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error((data && data.message) || "요청 실패: " + res.status);
    error.status = res.status;
    throw error;
  }
  return data;
}

// 고치기·지우기를 하고, 실제로 바뀐 줄이 없으면 오류로 본다
// (규칙에 막히면 Supabase는 오류 없이 "0줄 바뀜"으로 답하기 때문)
async function apiChange(path, method, body, prefer) {
  const rows = await api(path, {
    method,
    headers: { Prefer: "return=representation" + (prefer ? "," + prefer : "") },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!rows || rows.length === 0) throw new Error("바뀐 내용이 없어요. 권한을 확인해 주세요.");
  return rows;
}

// 파일을 resume 보관함의 folder/ 에 새 이름으로 올리고 공개 주소를 돌려준다
async function uploadFile(file, folder, allowedTypes) {
  const ext = allowedTypes[file.type];
  const name = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const path = folder + "/" + name;
  const token = await freshToken();
  const res = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": file.type,
    },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = "파일을 올리지 못했어요 (" + res.status + ")";
    try { message += ": " + JSON.parse(text).message; } catch (e) { /* 무시 */ }
    throw new Error(message);
  }
  return SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + path;
}

// 고른 파일이 괜찮은지 확인. 문제가 있으면 안내 문구, 없으면 빈 글자
function checkFile(file, allowedTypes, kindText) {
  if (!file) return "";
  if (!allowedTypes[file.type]) return kindText + "만 올릴 수 있어요. (고른 파일: " + file.name + ")";
  if (file.size > MAX_SIZE) return "10MB가 넘는 파일은 올릴 수 없어요. (" + (file.size / 1024 / 1024).toFixed(1) + "MB)";
  return "";
}

// ===== 작은 도우미 =====
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const b = el("button", "btn small " + (className || ""), text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function setStatus(id, text, isError) {
  const node = $(id);
  node.textContent = text || "";
  node.classList.toggle("error", !!isError);
}

function showPreview(boxId, url) {
  const box = $(boxId);
  box.textContent = "";
  if (url) {
    const img = el("img");
    img.src = url;
    img.alt = "";
    box.appendChild(img);
  }
}

function showCurrentLink(id, url, label) {
  const node = $(id);
  node.textContent = "";
  if (!url) {
    node.textContent = "지금: 없음";
    return;
  }
  node.append("지금: ");
  const a = el("a", "", label);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  node.appendChild(a);
}

function formatDate(value) {
  const d = new Date(value);
  return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." +
    String(d.getDate()).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// ===== 화면 바꾸기 =====
function showView(name) {
  $("login-view").hidden = name !== "login";
  $("denied-view").hidden = name !== "denied";
  $("admin-view").hidden = name !== "admin";
}

// 로그인한 사람이 admins 표에 있는지 확인하고 알맞은 화면을 연다
async function enter() {
  const rows = await api("admins?select=user_id");
  if (rows.length === 0) {
    $("denied-email").textContent = session.email || "";
    showView("denied");
    return;
  }
  $("admin-email").textContent = session.email || "";
  showView("admin");
  loadProfile().catch((e) => setStatus("profile-status", "프로필을 불러오지 못했어요: " + e.message, true));
  loadProjects().then(resetProjectForm).catch((e) => setStatus("project-status", "카드를 불러오지 못했어요: " + e.message, true));
  loadGuestbook().catch((e) => setStatus("guest-admin-status", "방명록을 불러오지 못했어요: " + e.message, true));
}

async function handleLogin() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) {
    setStatus("login-status", "이메일과 비밀번호를 모두 적어 주세요.", true);
    return;
  }
  $("login-button").disabled = true;
  setStatus("login-status", "로그인 중…");
  try {
    await signIn(email, password);
    $("login-password").value = "";
    setStatus("login-status", "");
    await enter();
  } catch (e) {
    clearSession();
    const text = e.status === 400 ? "이메일이나 비밀번호가 맞지 않아요." : "로그인하지 못했어요: " + e.message;
    setStatus("login-status", text, true);
  }
  $("login-button").disabled = false;
}

async function handleLogout() {
  if (session) {
    try { await authRequest("logout", null, session.access_token); } catch (e) { /* 이미 만료돼도 괜찮다 */ }
  }
  clearSession();
  showView("login");
}

// ===== 프로필 =====
const PROFILE_FIELDS = ["name", "title", "career_badge", "email", "phone", "location",
  "headline", "intro", "education", "skills", "experience", "quote"];
let profilePhotoUrl = null;

async function loadProfile() {
  const rows = await api("profile?select=*&id=eq.1");
  const p = rows[0] || {};
  PROFILE_FIELDS.forEach((f) => { $("p-" + f).value = p[f] || ""; });
  profilePhotoUrl = p.photo_url || null;
  $("photo-file").value = "";
  showPreview("photo-preview", profilePhotoUrl);
}

async function saveProfile() {
  const file = $("photo-file").files[0];
  const problem = checkFile(file, IMAGE_TYPES, "이미지(PNG·JPG·WEBP·GIF)");
  if (problem) {
    setStatus("profile-status", problem, true);
    return;
  }

  $("profile-save").disabled = true;
  try {
    if (file) {
      setStatus("profile-status", "사진 올리는 중…");
      profilePhotoUrl = await uploadFile(file, "profile", IMAGE_TYPES);
    }
    setStatus("profile-status", "저장 중…");
    const data = { id: 1, photo_url: profilePhotoUrl, updated_at: new Date().toISOString() };
    PROFILE_FIELDS.forEach((f) => { data[f] = $("p-" + f).value.trim(); });
    // 줄이 있으면 고치고, 없으면 새로 만든다
    await apiChange("profile?on_conflict=id", "POST", data, "resolution=merge-duplicates");
    await loadProfile();
    setStatus("profile-status", "저장했어요. 방문자 화면을 새로고침하면 보여요.");
  } catch (e) {
    setStatus("profile-status", "저장하지 못했어요: " + e.message, true);
  }
  $("profile-save").disabled = false;
}

// ===== 포트폴리오 카드 =====
let projects = [];
let likeCounts = {};
let editingId = null;        // 고치는 중인 카드 id (새 카드면 null)
let editThumbUrl = null;
let editFileUrl = null;

async function loadProjects() {
  const [rows, likes] = await Promise.all([
    api("projects?select=*&order=sort_order.asc,id.asc"),
    api("likes?select=project_id"),
  ]);
  projects = rows;
  likeCounts = {};
  likes.forEach((r) => { likeCounts[r.project_id] = (likeCounts[r.project_id] || 0) + 1; });
  renderProjects();
}

function renderProjects() {
  const list = $("project-list");
  list.textContent = "";
  if (projects.length === 0) {
    list.appendChild(el("li", "notice", "아직 카드가 없어요. 위에서 추가해 주세요."));
    return;
  }
  projects.forEach((p, index) => {
    const li = el("li", "admin-item");

    const view = el("div", "thumb-view");
    if (p.thumbnail_url) {
      const img = el("img");
      img.src = p.thumbnail_url;
      img.alt = "";
      view.appendChild(img);
    }

    const info = el("div");
    info.appendChild(el("p", "meta", [p.number, p.category].filter(Boolean).join(" · ") + "  (순서 " + p.sort_order + ")"));
    info.appendChild(el("h4", "", p.title));
    const likes = el("p", "likes");
    likes.append("좋아요 ");
    likes.appendChild(el("b", "", String(likeCounts[p.id] || 0)));
    likes.append(p.file_url ? " · 첨부 파일 있음" : " · 첨부 파일 없음");
    info.appendChild(likes);

    const actions = el("div", "item-actions");
    const up = button("▲ 올리기", "", () => moveProject(index, -1));
    const down = button("▼ 내리기", "", () => moveProject(index, 1));
    up.disabled = index === 0;
    down.disabled = index === projects.length - 1;
    actions.append(
      up,
      down,
      button("수정", "", () => startEdit(p)),
      button("좋아요 초기화", "danger", () => resetLikes(p)),
      button("삭제", "danger", () => deleteProject(p))
    );

    li.append(view, info, actions);
    list.appendChild(li);
  });
}

function resetProjectForm() {
  editingId = null;
  editThumbUrl = null;
  editFileUrl = null;
  ["number", "category", "title", "description", "tags"].forEach((f) => { $("c-" + f).value = ""; });
  const maxOrder = projects.reduce((m, p) => Math.max(m, p.sort_order), 0);
  $("c-sort_order").value = maxOrder + 1;
  $("thumb-file").value = "";
  $("attach-file").value = "";
  $("project-form-title").textContent = "새 카드 추가";
  refreshFileInfo();
}

function refreshFileInfo() {
  showPreview("thumb-preview", editThumbUrl);
  showCurrentLink("thumb-current", editThumbUrl, "썸네일 보기");
  showCurrentLink("attach-current", editFileUrl, "첨부 파일 보기");
}

function startEdit(p) {
  editingId = p.id;
  editThumbUrl = p.thumbnail_url;
  editFileUrl = p.file_url;
  $("c-number").value = p.number;
  $("c-category").value = p.category;
  $("c-title").value = p.title;
  $("c-description").value = p.description;
  $("c-tags").value = (p.tags || []).join(", ");
  $("c-sort_order").value = p.sort_order;
  $("thumb-file").value = "";
  $("attach-file").value = "";
  $("project-form-title").textContent = "카드 수정: " + p.title;
  setStatus("project-status", "");
  refreshFileInfo();
  $("project-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveProject() {
  const title = $("c-title").value.trim();
  if (!title) {
    setStatus("project-status", "제목을 적어 주세요.", true);
    return;
  }
  const thumbFile = $("thumb-file").files[0];
  const attachFile = $("attach-file").files[0];
  const problem = checkFile(thumbFile, IMAGE_TYPES, "썸네일은 이미지(PNG·JPG·WEBP·GIF)") ||
    checkFile(attachFile, FILE_TYPES, "첨부 파일은 PDF나 이미지");
  if (problem) {
    setStatus("project-status", problem, true);
    return;
  }

  $("project-save").disabled = true;
  try {
    if (thumbFile) {
      setStatus("project-status", "썸네일 올리는 중…");
      editThumbUrl = await uploadFile(thumbFile, "projects", IMAGE_TYPES);
    }
    if (attachFile) {
      setStatus("project-status", "첨부 파일 올리는 중…");
      editFileUrl = await uploadFile(attachFile, "projects", FILE_TYPES);
    }
    setStatus("project-status", "저장 중…");
    const data = {
      number: $("c-number").value.trim(),
      category: $("c-category").value.trim(),
      title,
      description: $("c-description").value.trim(),
      tags: $("c-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
      sort_order: parseInt($("c-sort_order").value, 10) || 0,
      thumbnail_url: editThumbUrl,
      file_url: editFileUrl,
    };
    if (editingId) {
      await apiChange("projects?id=eq." + editingId, "PATCH", data);
    } else {
      await apiChange("projects", "POST", data);
    }
    await loadProjects();
    resetProjectForm();
    setStatus("project-status", "저장했어요. 방문자 화면을 새로고침하면 보여요.");
  } catch (e) {
    setStatus("project-status", "저장하지 못했어요: " + e.message, true);
  }
  $("project-save").disabled = false;
}

async function deleteProject(p) {
  if (!confirm("'" + p.title + "' 카드를 지울까요?\n이 카드의 좋아요도 같이 지워져요.")) return;
  try {
    await apiChange("projects?id=eq." + p.id, "DELETE");
    if (editingId === p.id) resetProjectForm();
    await loadProjects();
    setStatus("project-status", "카드를 지웠어요.");
  } catch (e) {
    setStatus("project-status", "지우지 못했어요: " + e.message, true);
  }
}

// 순서 올리기·내리기: 옮긴 뒤 1, 2, 3 … 으로 다시 번호를 매기고 바뀐 카드만 저장
async function moveProject(index, step) {
  const target = index + step;
  if (target < 0 || target >= projects.length) return;
  const order = projects.slice();
  [order[index], order[target]] = [order[target], order[index]];
  try {
    setStatus("project-status", "순서 바꾸는 중…");
    for (let i = 0; i < order.length; i++) {
      if (order[i].sort_order !== i + 1) {
        await apiChange("projects?id=eq." + order[i].id, "PATCH", { sort_order: i + 1 });
      }
    }
    await loadProjects();
    setStatus("project-status", "순서를 바꿨어요.");
  } catch (e) {
    setStatus("project-status", "순서를 바꾸지 못했어요: " + e.message, true);
    loadProjects().catch(() => {});
  }
}

async function resetLikes(p) {
  const count = likeCounts[p.id] || 0;
  if (count === 0) {
    setStatus("project-status", "'" + p.title + "' 카드는 좋아요가 0개예요.");
    return;
  }
  if (!confirm("'" + p.title + "' 카드의 좋아요 " + count + "개를 모두 지울까요?")) return;
  try {
    await apiChange("likes?project_id=eq." + p.id, "DELETE");
    await loadProjects();
    setStatus("project-status", "좋아요를 0으로 되돌렸어요.");
  } catch (e) {
    setStatus("project-status", "초기화하지 못했어요: " + e.message, true);
  }
}

// ===== 방명록 =====
async function loadGuestbook() {
  const rows = await api("resume_guestbook?select=*&order=created_at.desc");
  const list = $("guest-admin-list");
  list.textContent = "";
  if (rows.length === 0) {
    list.appendChild(el("li", "notice", "아직 남긴 글이 없어요."));
    return;
  }
  rows.forEach((row) => {
    const li = el("li", "guest-item");
    const text = el("div");
    const head = el("div", "guest-head");
    head.append(el("span", "guest-nick", row.nickname), el("span", "guest-date", formatDate(row.created_at)));
    text.append(head, el("p", "guest-msg", row.message));
    li.append(text, button("삭제", "danger", () => deleteGuest(row)));
    list.appendChild(li);
  });
}

async function deleteGuest(row) {
  if (!confirm(row.nickname + "님의 글을 지울까요?\n\n" + row.message)) return;
  try {
    await apiChange("resume_guestbook?id=eq." + row.id, "DELETE");
    await loadGuestbook();
    setStatus("guest-admin-status", "글을 지웠어요.");
  } catch (e) {
    setStatus("guest-admin-status", "지우지 못했어요: " + e.message, true);
  }
}

// ===== 버튼 연결 =====
$("login-button").addEventListener("click", handleLogin);
$("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) handleLogin();
});
$("logout-button").addEventListener("click", handleLogout);
$("denied-logout").addEventListener("click", handleLogout);

$("profile-save").addEventListener("click", saveProfile);
$("photo-clear").addEventListener("click", () => {
  profilePhotoUrl = null;
  $("photo-file").value = "";
  showPreview("photo-preview", null);
  setStatus("profile-status", "사진을 뺐어요. 프로필 저장을 눌러야 반영돼요.");
});
$("photo-file").addEventListener("change", () => {
  const file = $("photo-file").files[0];
  const problem = checkFile(file, IMAGE_TYPES, "이미지(PNG·JPG·WEBP·GIF)");
  setStatus("profile-status", problem, !!problem);
  if (file && !problem) showPreview("photo-preview", URL.createObjectURL(file));
});

$("project-save").addEventListener("click", saveProject);
$("project-cancel").addEventListener("click", () => {
  resetProjectForm();
  setStatus("project-status", "");
});
$("thumb-clear").addEventListener("click", () => {
  editThumbUrl = null;
  $("thumb-file").value = "";
  refreshFileInfo();
});
$("attach-clear").addEventListener("click", () => {
  editFileUrl = null;
  $("attach-file").value = "";
  refreshFileInfo();
});
$("thumb-file").addEventListener("change", () => {
  const file = $("thumb-file").files[0];
  const problem = checkFile(file, IMAGE_TYPES, "썸네일은 이미지(PNG·JPG·WEBP·GIF)");
  setStatus("project-status", problem, !!problem);
  if (file && !problem) showPreview("thumb-preview", URL.createObjectURL(file));
});
$("attach-file").addEventListener("change", () => {
  const problem = checkFile($("attach-file").files[0], FILE_TYPES, "첨부 파일은 PDF나 이미지");
  setStatus("project-status", problem, !!problem);
});

// ===== 시작 =====
session = loadSession();
if (session) {
  enter().catch(() => {
    clearSession();
    showView("login");
  });
} else {
  showView("login");
}

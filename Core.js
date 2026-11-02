/* core.js - Shared front-end data layer & Cloud Animal Sync */

const ALLOW_GUEST_DONATIONS = true;

const Auth = (() => {
    const USERS = "pawforwardUsers", SESSION = "pawforwardSession", CODE = "pawforwardCode";
    const read = (k, fallback, store) => {
        try { const v = JSON.parse((store || localStorage).getItem(k)); return v === null ? fallback : v; }
        catch (e) { return fallback; }
    };
    const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); };
    const users = () => read(USERS, []);
    const saveUsers = (list) => localStorage.setItem(USERS, JSON.stringify(list));
    const norm = (e) => e.trim().toLowerCase();
    const nameOf = (u) => {
        if (u.firstName) return u.firstName;
        const local = u.email.split("@")[0].split(/[._+\-\d]+/)[0] || u.email.split("@")[0];
        return local.charAt(0).toUpperCase() + local.slice(1);
    };
    const start = (u) => localStorage.setItem(SESSION, JSON.stringify({ email: u.email, firstName: nameOf(u), role: u.role || "user" }));

    return {
        current: () => read(SESSION, null),
        name() { const s = this.current(); return s ? s.firstName : ""; },
        exists: (email) => users().some((u) => u.email === norm(email)),
        profile() {
            const s = this.current();
            if (!s) return null;
            return users().find((u) => u.email === s.email) || { email: s.email, firstName: s.firstName || "", lastName: "", city: "", phone: "" };
        },

        signUp(d) {
            const list = users(), email = norm(d.email);
            let existing = list.find((u) => u.email === email);
            if (!existing) {
                existing = {
                    email,
                    pw: hash(d.password || "firebase-auth"),
                    firstName: d.firstName || "",
                    lastName: d.lastName || "",
                    city: d.city || "",
                    phone: d.phone || "",
                    createdAt: new Date().toISOString()
                };
                list.push(existing);
                saveUsers(list);
            }
            start(existing);
            return { ok: true };
        },
        signIn(emailRaw, password) {
            const email = norm(emailRaw);
            let user = users().find((u) => u.email === email);
            if (!user) {
                user = { email, pw: hash(password), firstName: "", lastName: "", city: "", phone: "", createdAt: new Date().toISOString() };
                const list = users(); list.push(user); saveUsers(list);
            }
            start(user);
            return { ok: true };
        },
        signOut: () => {
            localStorage.removeItem(SESSION);
            localStorage.removeItem("paw_user_role");
            if (window.PawFirebase) window.PawFirebase.logout();
        },

        updateProfile(fields) {
            const list = users(), s = this.current();
            if (!s) return { ok: false, error: "Please sign in again." };
            let user = list.find((u) => u.email === s.email);
            if (!user) {
                user = { email: s.email, pw: "", firstName: s.firstName || "", lastName: "", city: "", phone: "" };
                list.push(user);
            }
            ["firstName", "lastName", "city", "phone"].forEach((k) => { if (k in fields) user[k] = String(fields[k]).trim(); });
            saveUsers(list); start(user);
            return { ok: true };
        },
        changePassword(current, next) {
            const list = users(), s = this.current();
            const user = s && list.find((u) => u.email === s.email);
            if (!user) return { ok: false, error: "Please sign in again." };
            user.pw = hash(next); saveUsers(list);
            return { ok: true };
        },
        resetPassword(email, next) {
            const list = users(), user = list.find((u) => u.email === norm(email));
            if (!user) return { ok: false, error: "Account not found." };
            user.pw = hash(next); saveUsers(list);
            return { ok: true };
        },
        sendCode(email) {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            sessionStorage.setItem(CODE, JSON.stringify({ email: norm(email), code: code, exp: Date.now() + 10 * 60000 }));
            return code;
        },
        verifyCode(email, code) {
            const c = read(CODE, null, sessionStorage);
            if (!c || c.email !== norm(email) || Date.now() > c.exp) return { ok: false, error: "That code has expired. Ask for a new one." };
            if (c.code !== code.trim()) return { ok: false, error: "That code isn't right. Check it and try again." };
            sessionStorage.removeItem(CODE);
            let u = users().find((x) => x.email === norm(email));
            if (!u) { u = { email: norm(email), pw: "", firstName: "" }; const l = users(); l.push(u); saveUsers(l); }
            start(u);
            return { ok: true };
        }
    };
})();

/* Per-user data: donations (with receipts), saved animals, adoption inquiries */
const UserData = (() => {
    const key = (email) => "pawforwardData:" + email.toLowerCase();
    const empty = () => ({ donations: [], saved: [], inquiries: [] });
    const load = () => {
        const s = Auth.current();
        if (!s) return null;
        try { return Object.assign(empty(), JSON.parse(localStorage.getItem(key(s.email)))); } catch (e) { return empty(); }
    };
    const save = (d) => {
        const s = Auth.current();
        if (s) localStorage.setItem(key(s.email), JSON.stringify(d));
    };
    return {
        donations() { const d = load(); return d ? d.donations : []; },
        addDonation(rec) { const d = load(); if (d) { d.donations.unshift(rec); save(d); } return rec; },
        saved() { const d = load(); return d ? d.saved : []; },
        isSaved(name) { return this.saved().includes(name); },
        toggleSaved(name) {
            const d = load(); if (!d) return false;
            const i = d.saved.indexOf(name);
            if (i >= 0) d.saved.splice(i, 1); else d.saved.push(name);
            save(d);
            return i < 0;
        },
        inquiries() { const d = load(); return d ? d.inquiries : []; },
        addInquiry(rec) {
            const d = load();
            if (d) {
                d.inquiries.unshift(Object.assign({ date: new Date().toISOString(), status: "Pending Review" }, rec));
                save(d);
            }
        }
    };
})();

function makeDonation(info) {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    return { id: "PF-" + stamp + "-" + String(Math.floor(1000 + Math.random() * 9000)), date: now.toISOString(), amount: info.amount, method: info.method, email: info.email || "", name: info.name || "" };
}

const Fund = {
    goal: 50000,
    key: "pawforwardRaised",
    raised() { const n = Number(localStorage.getItem(this.key)); return n > 0 ? n : 34000; },
    add(n) { localStorage.setItem(this.key, String(this.raised() + n)); },
    percent() { return Math.min((this.raised() / this.goal) * 100, 100); }
};

const FUNDS = [
    { label: "Food and shelter",      pct: 45, color: "#b63737" },
    { label: "Vet care and vaccines", pct: 30, color: "#c8921a" },
    { label: "Rescue operations",     pct: 15, color: "#7a8f6a" },
    { label: "Admin and fundraising", pct: 10, color: "#b9a8a6" }
];

/* Rescue stories with replaceable local paths + automatic high-res Unsplash fallbacks */
const STORIES = [
    { 
        id: "bantay", name: "Bantay", title: "From the roadside to the sofa", 
        text: "Found limping beside a highway, hungry and scared. After three weeks of vet care and a lot of cuddles, Bantay now sleeps on a sofa and chases his tail.",
        beforeFallback: "https://images.unsplash.com/photo-1518717758536-85ae29035b6d?auto=format&fit=crop&w=700&q=80",
        afterFallback: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=700&q=80"
    },
    { 
        id: "luna", name: "Luna", title: "Small, silent and sick", 
        text: "Luna arrived with an eye infection and barely any fur. A patient foster family nursed her back, and she learned to purr again.",
        beforeFallback: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=700&q=80",
        afterFallback: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=700&q=80"
    },
    { 
        id: "choco", name: "Choco", title: "A second chance at a family", 
        text: "Choco spent months alone on a construction site. Today he walks to school with the kids who adopted him.",
        beforeFallback: "https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&w=700&q=80",
        afterFallback: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=700&q=80"
    }
];

/* ============================ Animals Catalog ============================ */
const HIDDEN_GEM_DAYS = 90;
const SENIOR_FROM_MONTHS = 84;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const ANIMALS = [
    { name: "Bantay",   type: "Dog", sex: "Male",   ageMonths: 24,  status: "Available", arrivalDate: daysAgo(140), img: "images/animal-bantay.jpg",   fallbackImg: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=700&q=80", desc: "Loyal and playful. Loves long walks and learns tricks fast. Fully vaccinated and neutered." },
    { name: "Mingming", type: "Cat", sex: "Female", ageMonths: 12,  status: "Available", arrivalDate: daysAgo(35),  img: "images/animal-mingming.jpg", fallbackImg: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=700&q=80", desc: "Gentle lap cat who purrs the moment you sit down. Litter-trained and great in apartments." },
    { name: "Choco",    type: "Dog", sex: "Male",   ageMonths: 48,  status: "Available", arrivalDate: daysAgo(20),  img: "images/animal-choco.jpg",    fallbackImg: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=700&q=80", desc: "Calm and cuddly. Great with kids and other dogs. Rescued from a construction site." },
    { name: "Luna",     type: "Cat", sex: "Female", ageMonths: 36,  status: "Available", arrivalDate: daysAgo(95),  img: "images/animal-luna.jpg",     fallbackImg: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=700&q=80", desc: "Curious and clever. Happiest near a sunny window. Spayed and microchipped." },
    { name: "Tagpi",    type: "Dog", sex: "Female", ageMonths: 6,   status: "Available", arrivalDate: daysAgo(12),  img: "images/animal-tagpi.jpg",    fallbackImg: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=700&q=80", desc: "Energetic puppy who needs a patient, active family. Loves squeaky toys." },
    { name: "Kiko",     type: "Cat", sex: "Male",   ageMonths: 24,  status: "Available", arrivalDate: daysAgo(60),  img: "images/animal-kiko.jpg",     fallbackImg: "https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=700&q=80", desc: "Shy at first, then your best friend. Loves treats and quiet evenings." },
    { name: "Brownie",  type: "Dog", sex: "Male",   ageMonths: 96,  status: "Available", arrivalDate: daysAgo(210), img: "images/animal-brownie.jpg",  fallbackImg: "https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&w=700&q=80", desc: "A gentle old soul who loves slow walks and warm laps. Our longest resident." },
    { name: "Pusit",    type: "Cat", sex: "Male",   ageMonths: 3,   status: "Available", arrivalDate: daysAgo(8),   img: "images/animal-pusit.jpg",    fallbackImg: "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?auto=format&fit=crop&w=700&q=80", desc: "Tiny, fluffy and very playful. Chases anything that moves." },
    { name: "Lola",     type: "Cat", sex: "Female", ageMonths: 120, status: "Available", arrivalDate: daysAgo(48),  img: "images/animal-lola.jpg",     fallbackImg: "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=700&q=80", desc: "Calm senior who just wants a quiet home and a soft bed." }
];

function formatAge(months) {
    if (months < 12) return months + (months === 1 ? " Month" : " Months");
    const y = Math.floor(months / 12), r = months % 12;
    return y + (y === 1 ? " Year" : " Years") + (r ? " " + r + (r === 1 ? " Month" : " Months") : "");
}
function ageGroup(a) { return a.ageMonths < 12 ? "young" : a.ageMonths >= SENIOR_FROM_MONTHS ? "senior" : "adult"; }
function ageGroupLabel(a) { const g = ageGroup(a); return g === "young" ? (a.type === "Dog" ? "Puppy" : "Kitten") : g === "senior" ? "Senior" : "Adult"; }
function daysInShelter(a) { return Math.max(0, Math.floor((Date.now() - new Date((a.arrivalDate || daysAgo(15)) + "T00:00:00").getTime()) / 86400000)); }
function isHiddenGem(a) { return daysInShelter(a) > HIDDEN_GEM_DAYS; }

function sortAnimals(list) {
    return list.slice().sort((a, b) => (isHiddenGem(b) - isHiddenGem(a)) || (daysInShelter(b) - daysInShelter(a)));
}

/* Detailed Pet Profile & Direct Adoption Modal */
function openPetProfileModal(a) {
    let d = document.getElementById("petProfileDialog");
    if (!d) {
        d = document.createElement("dialog");
        d.id = "petProfileDialog";
        d.className = "auth receipt";
        document.body.appendChild(d);
        d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
        d.addEventListener("close", () => { document.body.style.overflow = ""; });
    }
    const fallback = a.fallbackImg || (a.type === "Cat" ? "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=700&q=80" : "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=700&q=80");
    const statusText = a.status || "Available";
    d.innerHTML =
        '<div class="dlg-inner receipt-inner" style="max-width:560px;">' +
            '<button type="button" class="dlg-close" aria-label="Close profile">&times;</button>' +
            '<div style="height:240px;border-radius:16px;overflow:hidden;margin-bottom:18px;background:var(--blush);position:relative;">' +
                '<img src="' + (a.img || fallback) + '" alt="' + a.name + '" onerror="this.onerror=null;this.src=\'' + fallback + '\'" style="width:100%;height:100%;object-fit:cover;">' +
                '<span class="badge badge-type" style="position:absolute;bottom:12px;left:12px;">' + statusText + '</span>' +
            '</div>' +
            '<h2 style="text-align:left;margin-bottom:8px;">Meet ' + a.name + '</h2>' +
            '<ul class="badges" style="margin-bottom:14px;">' +
                '<li class="badge badge-type">' + a.type + '</li>' +
                '<li class="badge">' + formatAge(a.ageMonths || 18) + '</li>' +
                '<li class="badge">' + (a.sex || "Friendly") + '</li>' +
                '<li class="badge badge-group">' + ageGroupLabel(a) + '</li>' +
            '</ul>' +
            '<p style="color:var(--muted);margin-bottom:18px;">' + a.desc + '</p>' +
            '<div style="padding:14px;border-radius:12px;background:var(--blush);margin-bottom:20px;font-size:13px;">' +
                '<strong>✓ Medical & Shelter Status:</strong> Vaccinated, dewormed, vet-checked, and waiting ' + daysInShelter(a) + ' days at PawForward Shelter.' +
            '</div>' +
            '<div class="rc-actions">' +
                '<button type="button" class="btn btn-outline" data-close-pet>Close</button>' +
                '<a href="contact.html?pet=' + encodeURIComponent(a.name) + '" class="btn" style="text-decoration:none;">Apply to Adopt ' + a.name + '</a>' +
            '</div>' +
        '</div>';
    d.querySelector(".dlg-close").onclick = () => d.close();
    d.querySelector("[data-close-pet]").onclick = () => d.close();
    document.body.style.overflow = "hidden";
    d.showModal();
}

function animalCard(a, i) {
    const days = daysInShelter(a), gem = isHiddenGem(a);
    const fallback = a.fallbackImg || (a.type === "Cat" ? "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=700&q=80" : "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=700&q=80");
    const statusBadge = a.status && a.status !== "Available" ? '<span class="badge" style="background:#fff8e6;color:#b45d00;border-color:#f6c453;">' + a.status + '</span>' : '';

    const card = document.createElement("article");
    card.className = "animal-card clay-card" + (gem ? " is-gem" : "");
    card.style.setProperty("--i", i || 0);
    card.innerHTML =
        '<div class="animal-pic ph"><img loading="lazy"><button type="button" class="heart" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>' + (gem ? '<span class="gem-badge">\u2605 Hidden Gem</span>' : "") + "</div>" +
        '<div class="animal-info"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><h3></h3>' + statusBadge + '</div>' +
        '<ul class="badges" aria-label="Details"><li class="badge badge-type"></li><li class="badge badge-age"></li><li class="badge badge-sex"></li><li class="badge badge-group"></li></ul>' +
        '<p class="animal-desc"></p><p class="wait"></p>' +
        '<div style="display:flex;gap:8px;margin-top:auto;"><button type="button" class="btn btn-outline pet-profile-btn" style="flex:1;padding:10px 12px;font-size:13px;">Profile</button><a class="btn" style="flex:1.3;padding:10px 12px;font-size:13px;"></a></div></div>';
    
    const img = card.querySelector("img");
    img.src = a.img || fallback;
    img.alt = a.name;
    img.onerror = function() { this.onerror = null; this.src = fallback; };

    card.querySelector("h3").textContent = a.name;
    const heart = card.querySelector(".heart");
    heart.dataset.name = a.name;
    heart.setAttribute("aria-label", "Save " + a.name);
    heart.setAttribute("aria-pressed", UserData.isSaved(a.name));
    card.querySelector(".badge-type").textContent = a.type;
    card.querySelector(".badge-age").textContent = formatAge(a.ageMonths || 18);
    card.querySelector(".badge-sex").textContent = a.sex || "Male";
    card.querySelector(".badge-group").textContent = ageGroupLabel(a);
    card.querySelector(".animal-desc").textContent = a.desc;
    card.querySelector(".wait").textContent = gem
        ? "Waiting " + days + " days for a home. Give " + a.name + " a second look."
        : "In our shelter " + days + (days === 1 ? " day" : " days");
    
    card.querySelector(".pet-profile-btn").addEventListener("click", () => openPetProfileModal(a));
    const btn = card.querySelector("a.btn");
    btn.textContent = "Adopt " + a.name;
    btn.href = "contact.html?pet=" + encodeURIComponent(a.name);
    return card;
}
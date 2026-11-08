import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://crzzcsrdvmafpzvrkoyx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Is6c7sQU-hGdrHxmOdZH9w_t-yvKk-m";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const CREATOR_ADMIN_EMAILS = [
    "admin@pawforward.org",
    "silasmasbad20@gmail.com",
    "hello@pawforward.org",
    "snakeflash154@gmail.com",
    "advinculajared08@gmail.com"
];

export async function verifyAdminAccess(user) {
    if (!user || !user.email) return false;
    const cleanEmail = user.email.trim().toLowerCase();
    if (CREATOR_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(cleanEmail)) {
        return true;
    }
    try {
        const { data, error } = await supabase
            .from("users")
            .select("role")
            .eq("uid", user.id)
            .single();
        return !error && data && data.role === "admin";
    } catch (err) {
        return false;
    }
}

export const EMAIL_CONFIG = {
    enabled: false,
    serviceId: "YOUR_EMAILJS_SERVICE_ID",
    templateId: "YOUR_EMAILJS_TEMPLATE_ID",
    publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
    adminInbox: "hello@pawforward.org"
};

export async function sendAutomatedEmail({ to_email, to_name, subject, message, reply_to }) {
    try {
        await supabase.from("mail_logs").insert([{
            to_email: to_email || EMAIL_CONFIG.adminInbox,
            to_name: to_name || "PawForward User",
            subject: subject || "PawForward Notification",
            message: message || "",
            reply_to: reply_to || EMAIL_CONFIG.adminInbox,
            createdAt: new Date().toISOString()
        }]);
    } catch (e) {}

    if (!EMAIL_CONFIG.enabled || EMAIL_CONFIG.publicKey === "YOUR_EMAILJS_PUBLIC_KEY") {
        return { ok: true, simulated: true };
    }

    try {
        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                service_id: EMAIL_CONFIG.serviceId,
                template_id: EMAIL_CONFIG.templateId,
                user_id: EMAIL_CONFIG.publicKey,
                template_params: {
                    to_email: to_email || EMAIL_CONFIG.adminInbox,
                    to_name: to_name || "Supporter",
                    subject: subject,
                    message: message,
                    reply_to: reply_to || EMAIL_CONFIG.adminInbox
                }
            })
        });
        return { ok: response.ok };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

// Keeps the name PawFirebase so your HTML and UI scripts work without changes
window.PawFirebase = {
    supabase,
    verifyAdminAccess,
    sendAutomatedEmail,

    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password
        });
        if (error) {
            alert("Login Failed: " + error.message);
            const verifyBtn = document.querySelector('button[type="submit"]');
            if (verifyBtn) verifyBtn.textContent = "Sign In";
            throw error;
        }
        const user = { ...data.user, uid: data.user.id };
        const isAdmin = await verifyAdminAccess(user);
        localStorage.setItem("paw_user_role", isAdmin ? "admin" : "user");
        return { user, isAdmin };
    },

    async register(email, password, profile = {}) {
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password: password
        });
        if (error) {
            alert("Registration Failed: " + error.message);
            const verifyBtn = document.querySelector('button[type="submit"]');
            if (verifyBtn) verifyBtn.textContent = "Create Account";
            throw error;
        }
        const user = { ...data.user, uid: data.user.id };
        const isAdmin = await verifyAdminAccess(user);
        const defaultName = profile.firstName || user.email.split("@")[0];
        const userRecord = {
            uid: user.id,
            email: user.email.toLowerCase(),
            firstName: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
            lastName: profile.lastName || "",
            city: profile.city || "",
            phone: profile.phone || "",
            role: isAdmin ? "admin" : "adopter",
            createdAt: new Date().toISOString()
        };

        try {
            await supabase.from("users").upsert([userRecord]);
        } catch (e) {}

        localStorage.setItem("paw_user_role", isAdmin ? "admin" : "user");
        return { user, isAdmin, userRecord };
    },

    async logout() {
        try { await supabase.auth.signOut(); } catch (e) {}
        localStorage.removeItem("paw_user_role");
        localStorage.removeItem("pawforwardSession");
    },

    async resetPasswordEmail(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
    },

    async submitInquiryToCloud(data) {
        const payload = {
            name: data.name || "Supporter",
            email: (data.email || "").toLowerCase().trim(),
            topic: data.topic || "Adopting a pet",
            pet: data.pet || "General Shelter Inquiry",
            message: data.message || "",
            status: "Pending Review",
            createdAt: new Date().toISOString()
        };
        const { data: inserted, error } = await supabase
            .from("inquiries")
            .insert([payload])
            .select()
            .single();
        if (error) throw error;
        return { id: inserted.id, ...payload };
    },

    async fetchUserInquiriesFromCloud(email) {
        if (!email) return [];
        try {
            const { data, error } = await supabase
                .from("inquiries")
                .select("*")
                .ilike("email", email.trim())
                .order("createdAt", { ascending: false });
            if (error || !data) return [];
            return data.map(item => ({
                id: item.id,
                topic: item.topic || "Adopting a pet",
                pet: item.pet || "",
                message: item.message || "",
                status: item.status || "Pending Review",
                date: item.createdAt || new Date().toISOString()
            }));
        } catch (e) {
            return [];
        }
    },

    async fetchCloudAnimals() {
        try {
            const { data, error } = await supabase.from("animals").select("*");
            if (error || !data) return [];
            return data.map(a => ({
                id: a.id,
                name: a.name || "Unnamed Pet",
                type: a.type || "Dog",
                sex: a.sex || "Male",
                ageMonths: Number(a.ageMonths) || 18,
                status: a.status || "Available",
                arrivalDate: a.arrivalDate || new Date(Date.now() - 25 * 86400000).toISOString().slice(0, 10),
                img: a.img || "",
                desc: a.desc || "Healthy, vaccinated, and waiting for a loving family at PawForward."
            }));
        } catch (err) {
            return [];
        }
    }
};

// NOTE: keep this callback synchronous. Awaiting other Supabase calls (like
// verifyAdminAccess -> supabase.from(...)) inside onAuthStateChange can deadlock
// supabase-js, which leaves the user half signed-in. Slow work is deferred below.
supabase.auth.onAuthStateChange((event, session) => {
    const fbUser = session?.user;
    if (fbUser) {
        const currentLocal = JSON.parse(localStorage.getItem("pawforwardSession") || "null");
        const fallbackFirst = fbUser.email.split("@")[0];
        const cachedRole = localStorage.getItem("paw_user_role") === "admin" ? "admin" : "user";
        localStorage.setItem("pawforwardSession", JSON.stringify({
            uid: fbUser.id,
            email: fbUser.email.toLowerCase(),
            firstName: (currentLocal && currentLocal.firstName) ? currentLocal.firstName : (fallbackFirst.charAt(0).toUpperCase() + fallbackFirst.slice(1)),
            role: cachedRole
        }));
        window.dispatchEvent(new Event("authchange"));

        // Work out the real admin role afterwards, outside the auth callback.
        setTimeout(async () => {
            const isAdmin = await verifyAdminAccess(fbUser);
            const role = isAdmin ? "admin" : "user";
            localStorage.setItem("paw_user_role", role);
            const s = JSON.parse(localStorage.getItem("pawforwardSession") || "null");
            if (s && s.uid === fbUser.id && s.role !== role) {
                s.role = role;
                localStorage.setItem("pawforwardSession", JSON.stringify(s));
                window.dispatchEvent(new Event("authchange"));
            }
        }, 0);
    } else {
        // Only clear the stored login when Supabase says the user really signed out,
        // or when the stored login came from Supabase (it has a uid). A code-based
        // login is local-only (no uid) and must survive the empty INITIAL_SESSION
        // event that fires on every page load.
        const stored = JSON.parse(localStorage.getItem("pawforwardSession") || "null");
        if (event === "SIGNED_OUT" || (stored && stored.uid)) {
            localStorage.removeItem("paw_user_role");
            localStorage.removeItem("pawforwardSession");
            localStorage.removeItem("paw_user_email");
            localStorage.removeItem("paw_user_name");
        }
        window.dispatchEvent(new Event("authchange"));
    }
});
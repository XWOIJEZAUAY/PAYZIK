/** Finalisation du compte Google : choix du rôle + infos réelles du commerçant. */
import { useState } from "react";
import { Store, Wallet } from "lucide-react";
import { completeGoogleSignup, type Profile } from "../../services/auth";

function Field({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[12px] outline-none focus:border-[#E91E83]"
    />
  );
}

export function GoogleSetup({
  user,
  onDone,
}: {
  user: Profile;
  onDone: (u: Profile) => void;
}) {
  const [role, setRole] = useState<"merchant" | "customer" | null>(null);
  const [name, setName] = useState(user.name === "Utilisateur" ? "" : user.name);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopCity, setShopCity] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!role) {
      setError("Choisis ton espace.");
      return;
    }
    if (role === "merchant" && !shopName.trim()) {
      setError("Nom de la boutique requis.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await completeGoogleSignup({
      role,
      name: name.trim(),
      phone: phone.trim() || null,
      city: city.trim() || null,
      address: null,
      responsible: role === "merchant" ? name.trim() || null : null,
      shop: role === "merchant" ? {
        name: shopName.trim(),
        city: shopCity.trim() || null,
        address: shopAddress.trim() || null,
        phone: shopPhone.trim() || null,
        responsible: name.trim() || null,
      } : undefined,
    });
    if (!res.ok || !res.user) {
      setBusy(false);
      setError(res.error ?? "Création impossible.");
      return;
    }
    onDone(res.user);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#E9DDF2] p-4">
      <div className="w-full max-w-[420px] space-y-3 rounded-2xl border border-[#E9DDF2] bg-white p-5 shadow-lg">
        <div>
          <h1 className="text-[17px] font-bold text-[#21152C]">Un dernier pas</h1>
          <p className="text-[11px] text-[#81748A]">Choisis ton espace.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setRole("customer")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-3 text-[12px] font-bold ${
              role === "customer"
                ? "border-transparent bg-[#E91E83] text-white"
                : "border-[#E9DDF2] text-[#81748A]"
            }`}
          >
            <Wallet size={15} /> Client
          </button>
          <button
            onClick={() => setRole("merchant")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-3 text-[12px] font-bold ${
              role === "merchant"
                ? "border-transparent bg-[#E91E83] text-white"
                : "border-[#E9DDF2] text-[#81748A]"
            }`}
          >
            <Store size={15} /> Commerçant
          </button>
        </div>

        {role && (
          <div className="space-y-2">
            <Field value={name} onChange={setName} placeholder="Nom complet" />
            {role === "customer" ? (
              <Field value={city} onChange={setCity} placeholder="Ville (facultatif)" />
            ) : (
              <>
                <Field value={shopName} onChange={setShopName} placeholder="Nom de la boutique" />
                <Field value={shopCity} onChange={setShopCity} placeholder="Ville" />
                <Field value={shopAddress} onChange={setShopAddress} placeholder="Adresse" />
                <Field value={shopPhone} onChange={setShopPhone} placeholder="Téléphone" />
                <Field value={phone} onChange={setPhone} placeholder="Ton téléphone" />
              </>
            )}
          </div>
        )}

        {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={busy || !role}
          className="w-full rounded-xl bg-[#E91E83] py-3 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {busy ? "Un instant…" : "Continuer"}
        </button>
      </div>
    </div>
  );
}

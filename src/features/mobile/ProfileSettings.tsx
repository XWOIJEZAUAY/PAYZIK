/** PAYZIK — Écran « Mon profil / Ma boutique ». */
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Save } from "lucide-react";
import type { Profile as ProfileType } from "../../services/auth";
import { updateProfile } from "../../services/auth";
import { listMyShops, updateShop, type Shop } from "../../services/backend/payzikCards";

type Props = {
  user: ProfileType;
  onClose: () => void;
  onUpdated: (p: ProfileType) => void;
  onLogout: () => void;
  notify: (m: string) => void;
};

function photoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900 outline-none focus:border-[#8136A8]"
      />
    </label>
  );
}

export function ProfileSettings({ user, onClose, onUpdated, onLogout, notify }: Props) {
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [city, setCity] = useState(user.city ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [responsible, setResponsible] = useState(user.responsible ?? "");
  const [image, setImage] = useState<string | null>(user.image ?? null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopCity, setShopCity] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopResponsible, setShopResponsible] = useState("");
  const [shopImage, setShopImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.role !== "merchant") return;
    let alive = true;
    (async () => {
      const res = await listMyShops();
      if (!alive || !res.ok || !res.data.length) return;
      const s = res.data[0];
      setShop(s);
      setShopName(s.shop_name ?? "");
      setShopCity(s.city ?? "");
      setShopAddress(s.address ?? "");
      setShopPhone(s.phone ?? "");
      setShopResponsible(s.responsible_name ?? "");
      setShopImage(s.image ?? null);
    })();
    return () => { alive = false; };
  }, [user.role]);

  const save = async () => {
    setBusy(true);
    const res = await updateProfile({
      name: name.trim() || null,
      phone: phone.trim() || null,
      city: city.trim() || null,
      address: address.trim() || null,
      responsible: responsible.trim() || null,
      image,
    });
    if (!res.ok) {
      setBusy(false);
      notify(res.error ?? "Enregistrement impossible");
      return;
    }
    if (user.role === "merchant" && shop) {
      const sRes = await updateShop(shop.id, {
        name: shopName.trim() || null,
        city: shopCity.trim() || null,
        address: shopAddress.trim() || null,
        phone: shopPhone.trim() || null,
        responsible: shopResponsible.trim() || null,
        image: shopImage,
      });
      if (!sRes.ok) {
        setBusy(false);
        notify(sRes.error ?? "Boutique non enregistrée");
        return;
      }
    }
    setBusy(false);
    onUpdated(res.profile as ProfileType);
    notify("Informations enregistrées");
    onClose();
  };

  return (
    <div className="flex h-full flex-col bg-[#FDF9FE]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="flex items-center gap-3">
          <button onClick={onClose} aria-label="Retour" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Compte PAYZIK</p>
            <p className="truncate text-[15px] font-bold text-slate-900">Mon profil</p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            {image ? (
              <img src={image} alt="Photo de profil" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#8136A8] text-lg font-bold text-white">
                {(name || user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-[13px] font-bold text-slate-900">{name || user.email}</p>
              <p className="text-[11px] text-slate-500">{user.email}</p>
            </div>
          </div>
          <label className="block text-[11px] font-semibold text-slate-500">
            Ma photo
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-[11px]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void photoToDataUrl(f).then(setImage);
              }}
            />
          </label>
          <Field label="Nom complet" value={name} onChange={setName} />
          <Field label="Téléphone" value={phone} onChange={setPhone} />
          <Field label="Ville" value={city} onChange={setCity} />
          <Field label="Adresse" value={address} onChange={setAddress} />
          {user.role === "merchant" && (
            <Field label="Responsable commercial" value={responsible} onChange={setResponsible} />
          )}
        </section>

        {user.role === "merchant" && (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[#8136A8]">Ma boutique</p>
            {shopImage && <img src={shopImage} alt="Photo de la boutique" className="h-28 w-full rounded-xl object-cover" />}
            <label className="block text-[11px] font-semibold text-slate-500">
              Photo de la boutique
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-[11px]"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void photoToDataUrl(f).then(setShopImage);
                }}
              />
            </label>
            <Field label="Nom du hanout" value={shopName} onChange={setShopName} />
            <Field label="Ville" value={shopCity} onChange={setShopCity} />
            <Field label="Adresse" value={shopAddress} onChange={setShopAddress} />
            <Field label="Téléphone" value={shopPhone} onChange={setShopPhone} />
            <Field label="Responsable" value={shopResponsible} onChange={setShopResponsible} />
          </section>
        )}

        <button
          onClick={() => void save()}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#8136A8] text-[13px] font-bold text-white disabled:opacity-50"
        >
          <Save size={16} /> {busy ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>

        <button
          onClick={() => { onLogout(); onClose(); }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white text-[13px] font-bold text-rose-600"
        >
          <LogOut size={16} /> Se déconnecter
        </button>
      </div>
    </div>
  );
}

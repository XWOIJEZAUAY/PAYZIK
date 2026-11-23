import { RotateCcw, Camera, Globe } from "lucide-react";
import { useState } from "react";
import type { Store } from "../../state/store";
import { Button, Card } from "../../components/ui";
import { getAiLang, setAiLang, aiLangLabel, type AiLang } from "../../lib/aiLang";

export function SettingsView({ store }: { store: Store }) {
  const [lang, setLang] = useState<AiLang>(getAiLang());
  const changeLang = (l: AiLang) => {
    setAiLang(l);
    setLang(l);
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-6">
      <div>
        <h2 className="text-lg font-black text-ink">Paramètres</h2>
        <p className="text-sm text-slate-400">Magasin, données et préférences</p>
      </div>
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-600">Magasin</span>
          <span className="font-bold text-ink">Hanout Central</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-600">Caissier</span>
          <span className="font-bold text-ink">Youssef</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-600">Devise</span>
          <span className="font-bold text-ink">Dirham (DH)</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-600">Persistance</span>
          <span className="font-bold text-ink">localStorage (démo)</span>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-brand" />
          <p className="text-sm font-bold text-ink">Langue de l'agent IA</p>
        </div>
        <p className="text-xs text-slate-400">
          L'IA répondra dans la langue choisie (voix + texte).
        </p>
        <div className="flex gap-2">
          {(["darija", "tachelhit"] as AiLang[]).map((l) => (
            <button
              key={l}
              onClick={() => changeLang(l)}
              className={
                "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-all " +
                (lang === l
                  ? "border-brand bg-brand text-white shadow-sm"
                  : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800")
              }
            >
              {aiLangLabel(l)}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          Actuel : <strong>{aiLangLabel(lang)}</strong>
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-brand" />
          <p className="text-sm font-bold text-ink">Images des produits</p>
        </div>
        <p className="text-xs text-slate-400">
          Recherche automatique sur <strong>Open Food Facts</strong> (sans clé,
          sans compte) pour les produits sans photo, plus capture photo / import
          manuel (redimensionné à 300 px max, stocké localement). Les photos du
          commerçant sont prioritaires pour les produits locaux et en vrac.
        </p>
      </Card>

      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-bold text-ink">Réinitialiser la démo</p>
          <p className="text-xs text-slate-400">
            Restaure les produits et clients de démonstration.
          </p>
        </div>
        <Button variant="danger" onClick={store.resetDemo}>
          <RotateCcw size={15} /> Réinitialiser
        </Button>
      </Card>
    </div>
  );
}

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Search, 
  Leaf, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  ExternalLink, 
  Loader2, 
  ShieldCheck,
  Zap,
  ShoppingBag,
  ArrowRight,
  RotateCcw
} from 'lucide-react';

// --- Types ---
interface Ingredient {
  name: string;
  quantity: string;
  status: 'healthy' | 'harmful' | 'neutral';
  description: string;
}

interface AnalysisResult {
  productName: string;
  summary: string;
  ingredients: Ingredient[];
  sources: { title: string; uri: string }[];
  fssaiNotice?: string;
  healthScore?: number; // 0-100
}

// --- App Component ---
const FoodAnalyzer = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeFood = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Create a fresh instance to ensure the latest API key is used
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const prompt = `
        Perform a deep dive analysis of the Indian food product: "${query}". 
        This product is specifically being checked for the Indian market.
        
        Step 1: Search for the latest ingredient label of "${query}" in India (check FSSAI filings or recent supermarket listings).
        Step 2: Identify the EXACT ingredients and their quantities (e.g., "Sugar: 35g per 100g", "Palm Oil: 15%").
        Step 3: Evaluate each ingredient against modern nutritional science:
           - "Healthy": Natural, whole ingredients.
           - "Harmful": Excessive refined sugar, palm oil, MSG (E621), artificial colors (Sunset Yellow, etc.), high sodium, or trans fats.
           - "Neutral": Stabilizers, emulsifiers (if safe), or minor additives.
        Step 4: DOUBLE CHECK the quantities. If the product has multiple variants, specify which one you found.
        
        CRITICAL: Provide the response in this exact plain-text block structure:
        
        PRODUCT: [Official Name in India]
        SUMMARY: [2-3 sentence health impact summary]
        HEALTH_SCORE: [A number from 1 to 100, where 100 is cleanest]
        FSSAI_NOTICE: [Any specific FSSAI warning or "None"]
        
        LIST_START
        [Name] | [Quantity] | [Status: healthy/harmful/neutral] | [Concise Reason]
        ... (repeat for all major ingredients)
        LIST_END
      `;

      // Using gemini-flash-lite-latest for high efficiency and better free-tier rate limits
      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "";
      if (!text) throw new Error("No data received from the analyzer. Please try again.");

      // Parse grounding sources
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
          title: chunk.web.title,
          uri: chunk.web.uri,
        }));

      // Parsing Logic
      let productName = query;
      let summary = "Analysis complete.";
      let fssaiNotice = "";
      let healthScore = 50;
      const ingredients: Ingredient[] = [];

      const extractValue = (key: string) => {
        const regex = new RegExp(`${key}:\\s*(.*)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : null;
      };

      productName = extractValue("PRODUCT") || query;
      const parsedScore = parseInt(extractValue("HEALTH_SCORE") || "50");
      healthScore = isNaN(parsedScore) ? 50 : parsedScore;
      
      const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=HEALTH_SCORE|FSSAI_NOTICE|LIST_START|$)/i);
      if (summaryMatch) summary = summaryMatch[1].trim();

      const fssaiMatch = text.match(/FSSAI_NOTICE:\s*([\s\S]*?)(?=LIST_START|$)/i);
      if (fssaiMatch && !fssaiMatch[1].toLowerCase().includes("none")) {
        fssaiNotice = fssaiMatch[1].trim();
      }

      const listMatch = text.match(/LIST_START([\s\S]*?)LIST_END/i);
      const rows = listMatch ? listMatch[1].trim().split('\n') : [];

      for (const row of rows) {
        const cleanRow = row.replace(/^[-*•\d.]\s*/, '').trim();
        const parts = cleanRow.split('|').map(p => p.trim());
        
        if (parts.length >= 3) {
          const statusRaw = parts[2].toLowerCase();
          let status: 'healthy' | 'harmful' | 'neutral' = 'neutral';
          if (statusRaw.includes('harmful') || statusRaw.includes('bad') || statusRaw.includes('danger') || statusRaw.includes('concern')) status = 'harmful';
          else if (statusRaw.includes('healthy') || statusRaw.includes('good') || statusRaw.includes('safe')) status = 'healthy';

          ingredients.push({
            name: parts[0],
            quantity: parts[1] || "N/A",
            status,
            description: parts[3] || "Major component found in product label."
          });
        }
      }

      if (ingredients.length === 0) {
        throw new Error("Ingredient list could not be parsed. Please verify the product name.");
      }

      setResult({ productName, summary, ingredients, sources, fssaiNotice, healthScore });

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
        setError("Rate limit exceeded. Gemini Flash Lite has higher limits, but the API may still be busy. Please wait a moment and try again.");
      } else {
        setError(err.message || "Something went wrong while scanning the product.");
      }
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600 border-emerald-100 bg-emerald-50';
    if (score >= 40) return 'text-orange-600 border-orange-100 bg-orange-50';
    return 'text-rose-600 border-rose-100 bg-rose-50';
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-emerald-600';
    if (score >= 40) return 'bg-orange-600';
    return 'bg-rose-600';
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 font-sans selection:bg-orange-100">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-2 rounded-xl shadow-lg">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-800">
              PurePlate<span className="text-orange-600">Bharat</span>
            </span>
          </div>
          <div className="hidden md:flex gap-6 items-center text-sm font-bold text-slate-400">
            <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-orange-400" /> Flash Lite Engine</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> FSSAI Focused</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-16 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 border border-orange-100 text-orange-700 text-xs font-black uppercase tracking-widest shadow-sm">
            <ShoppingBag className="w-3.5 h-3.5" /> India's Nutrition Decoder
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">
            Stop eating <br /> 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-400">hidden chemicals.</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto font-medium">
            Enter any Indian snack, beverage, or packaged food to reveal the truth behind its label.
          </p>

          <form onSubmit={analyzeFood} className="relative max-w-2xl mx-auto pt-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-orange-500/10 blur-2xl rounded-3xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type="text"
                  placeholder="e.g. Kurkure, Maggi, Kissan Jam, Amul Cheese..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-14 pr-40 py-5 bg-white border border-slate-200 rounded-3xl shadow-xl focus:ring-0 focus:border-orange-500 transition-all outline-none text-lg font-medium"
                />
                <button
                  disabled={loading}
                  type="submit"
                  className="absolute right-2.5 top-2.5 bottom-2.5 px-8 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white font-black rounded-2xl transition-all flex items-center gap-2 text-sm uppercase tracking-widest shadow-lg active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Check <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          </form>

          {!loading && !result && !error && (
            <div className="flex flex-wrap justify-center gap-3 mt-8">
              {['Maggi Noodles', 'Haldiram Bhujia', 'Britannia Marie', 'Tropicana Orange'].map((item) => (
                <button
                  key={item}
                  onClick={() => { setQuery(item); setTimeout(() => analyzeFood(), 100); }}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:border-orange-300 hover:text-orange-600 transition-all shadow-sm"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div className="py-24 flex flex-col items-center animate-in fade-in">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 border-4 border-orange-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-orange-600 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-orange-600" />
              </div>
            </div>
            <div className="mt-8 text-center space-y-2">
              <h3 className="text-xl font-black text-slate-800">Analyzing Ingredients...</h3>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Powered by Gemini 2.5 Flash Lite</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-white border-2 border-rose-100 p-8 rounded-[2rem] shadow-xl animate-in zoom-in-95">
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-rose-50 p-3 rounded-2xl">
                <AlertCircle className="w-8 h-8 text-rose-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">Scan Interrupted</h3>
                <p className="text-slate-500 font-medium">We encountered a temporary issue.</p>
              </div>
            </div>
            <p className="bg-rose-50 p-4 rounded-xl text-rose-700 text-sm font-bold border border-rose-100 mb-6 italic">"{error}"</p>
            <button 
              onClick={() => analyzeFood()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-black transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500">
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
              <div className="p-10">
                <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-10">
                  <div className="space-y-4 max-w-lg">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border border-emerald-100 inline-block">Analysis Complete</span>
                    <h2 className="text-4xl font-black text-slate-900 leading-tight">{result.productName}</h2>
                    <p className="text-lg text-slate-600 font-medium leading-relaxed">{result.summary}</p>
                  </div>
                  
                  <div className="shrink-0 text-center space-y-3">
                    <div className={`w-32 h-32 rounded-3xl border-4 flex flex-col items-center justify-center shadow-lg transition-colors ${getScoreColor(result.healthScore || 50)}`}>
                      <span className="text-sm font-black uppercase tracking-widest opacity-60">Score</span>
                      <span className="text-5xl font-black">{result.healthScore}</span>
                    </div>
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${getScoreBg(result.healthScore || 50)}`} style={{ width: `${result.healthScore}%` }}></div>
                    </div>
                  </div>
                </div>

                {result.fssaiNotice && (
                  <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex items-start gap-4 mb-8">
                    <div className="bg-white p-2 rounded-xl shadow-sm">
                      <Info className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-orange-800 uppercase tracking-widest mb-1">Regulatory Alert</h4>
                      <p className="text-orange-900 font-bold">{result.fssaiNotice}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                  <div className="space-y-4">
                    <h5 className="flex items-center gap-2 text-emerald-700 font-black text-xs uppercase tracking-widest pl-2">
                      <Leaf className="w-4 h-4" /> Healthy & Safe
                    </h5>
                    {result.ingredients.filter(i => i.status !== 'harmful').map((ing, idx) => (
                      <div key={idx} className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:border-emerald-200 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h6 className="font-bold text-slate-800">{ing.name}</h6>
                          <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">{ing.quantity}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">{ing.description}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h5 className="flex items-center gap-2 text-rose-700 font-black text-xs uppercase tracking-widest pl-2">
                      <AlertCircle className="w-4 h-4" /> Concerns & Chemicals
                    </h5>
                    {result.ingredients.filter(i => i.status === 'harmful').map((ing, idx) => (
                      <div key={idx} className="bg-rose-50/30 border border-rose-100 p-6 rounded-3xl shadow-sm hover:border-rose-300 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h6 className="font-bold text-rose-900">{ing.name}</h6>
                          <span className="text-[10px] font-black text-rose-400 bg-white px-2 py-0.5 rounded-lg border border-rose-100">{ing.quantity}</span>
                        </div>
                        <p className="text-xs text-rose-800/70 font-bold leading-relaxed">{ing.description}</p>
                      </div>
                    ))}
                    {result.ingredients.filter(i => i.status === 'harmful').length === 0 && (
                      <div className="p-8 text-center bg-emerald-50 rounded-3xl border border-emerald-100">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                        <p className="text-emerald-800 font-black uppercase text-xs tracking-widest">Clean Label!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {result.sources.length > 0 && (
                <div className="bg-slate-900 p-10">
                  <h6 className="text-white font-black text-xs uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-orange-500" /> Information Sources
                  </h6>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {result.sources.map((s, idx) => (
                      <a 
                        key={idx} 
                        href={s.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all"
                      >
                        <span className="text-xs font-bold text-slate-300 truncate pr-4 group-hover:text-white">{s.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-orange-400 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-center">
              <button 
                onClick={() => { setQuery(''); setResult(null); }}
                className="flex items-center gap-2 text-slate-400 hover:text-orange-600 font-black text-[10px] uppercase tracking-widest transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> New Analysis
              </button>
            </div>
          </div>
        )}

        <footer className="mt-32 pt-12 border-t border-slate-200 text-center space-y-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            PurePlate Bharat AI • Gemini 2.5 Flash Lite
          </p>
          <p className="text-xs text-slate-400 max-w-lg mx-auto font-medium leading-relaxed">
            Note: Data is retrieved in real-time. Please cross-verify with physical packaging labels.
          </p>
        </footer>
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<FoodAnalyzer />);
}

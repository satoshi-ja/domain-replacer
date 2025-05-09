import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Toaster, toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Save, History, ListChecks, XCircle } from 'lucide-react'; // Import icons, added XCircle
import './App.css';

interface HistoryEntry {
  id: string;
  timestamp: number;
  inputUrls: string;
  oldDomain: string;
  newDomain: string;
}

interface PresetEntry {
  id: string;
  name: string;
  oldDomain: string;
  newDomain: string;
}

// Helper function to remove protocol
const removeProtocol = (domain: string): string => {
  return domain.replace(/^(https?:\/\/)/i, '');
};

function App() {
  const [inputUrls, setInputUrls] = useState('');
  const [oldDomain, setOldDomain] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [outputUrls, setOutputUrls] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [presets, setPresets] = useState<PresetEntry[]>([]);
  const [presetName, setPresetName] = useState('');
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(true);

  // Load history and presets from localStorage on initial render
  useEffect(() => {
    const storedHistory = localStorage.getItem('domainReplacerHistory');
    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (e) {
        console.error("Failed to parse history from localStorage", e);
        localStorage.removeItem('domainReplacerHistory'); // Clear corrupted data
      }
    }
    const storedPresets = localStorage.getItem('domainReplacerPresets');
    if (storedPresets) {
      try {
        setPresets(JSON.parse(storedPresets));
      } catch (e) {
        console.error("Failed to parse presets from localStorage", e);
        localStorage.removeItem('domainReplacerPresets'); // Clear corrupted data
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) { // Avoid saving empty array initially if not needed
        localStorage.setItem('domainReplacerHistory', JSON.stringify(history));
    } else {
        // Clear localStorage if history becomes empty
        localStorage.removeItem('domainReplacerHistory');
    }
  }, [history]);

  // Save presets to localStorage whenever they change
  useEffect(() => {
     if (presets.length > 0) { // Avoid saving empty array initially if not needed
        localStorage.setItem('domainReplacerPresets', JSON.stringify(presets));
     } else {
        // Clear localStorage if presets become empty
        localStorage.removeItem('domainReplacerPresets');
     }
  }, [presets]);

  // --- Domain Auto-Extraction --- 
  const extractCommonDomain = useCallback((urlsText: string): string | null => {
    const urls = urlsText.split('\n').filter(url => url.trim() !== '');
    if (urls.length === 0) return null;

    const domainCounts: { [key: string]: number } = {};
    let maxCount = 0;
    let commonDomain: string | null = null;

    urls.forEach(urlStr => {
      try {
        const url = new URL(urlStr.trim());
        const domain = url.hostname;
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        if (domainCounts[domain] > maxCount) {
          maxCount = domainCounts[domain];
          commonDomain = domain;
        }
      } catch (e) {
        // Ignore invalid URLs for extraction
      }
    });

    // Only return if a domain appears in more than half the valid URLs or is the only one
    return (maxCount > urls.length / 2 || Object.keys(domainCounts).length === 1) ? commonDomain : null;
  }, []);

  useEffect(() => {
    if (autoExtractEnabled) {
      const commonDomain = extractCommonDomain(inputUrls);
      if (commonDomain && oldDomain === '') { // Only auto-fill if oldDomain is empty
        setOldDomain(removeProtocol(commonDomain)); // Remove protocol here too
      }
    }
  }, [inputUrls, autoExtractEnabled, extractCommonDomain, oldDomain]); // Added oldDomain dependency

  // --- Handlers with Protocol Removal --- 
  const handleOldDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOldDomain(removeProtocol(e.target.value));
  };

  const handleNewDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewDomain(removeProtocol(e.target.value));
  };

  // --- Core Replace Logic --- 
  const handleReplace = () => {
    const cleanOldDomain = removeProtocol(oldDomain.trim());
    const cleanNewDomain = removeProtocol(newDomain.trim());

    // Update state with cleaned versions immediately for consistency in history/presets
    setOldDomain(cleanOldDomain);
    setNewDomain(cleanNewDomain);

    console.log("--- handleReplace START ---");
    console.log("Current state (before replace):", { inputUrls, oldDomain: cleanOldDomain, newDomain: cleanNewDomain });

    if (!inputUrls || !cleanOldDomain || !cleanNewDomain) {
      toast.error('すべてのフィールドを入力してください。');
      console.log("Validation failed: Missing fields");
      console.log("--- handleReplace END (Validation Failed) ---");
      return;
    }

    const urls = inputUrls.split('\n').filter(url => url.trim() !== '');
    let invalidUrlCount = 0;
    const replacedUrlsArray = urls.map(urlStr => {
      try {
        const url = new URL(urlStr.trim());
        // Use cleaned domain for comparison
        if (url.hostname.toLowerCase() === cleanOldDomain.toLowerCase()) { 
          const originalHostname = url.hostname;
          // Use cleaned domain for replacement
          url.hostname = cleanNewDomain;
          console.log(`Replaced domain for ${urlStr.trim()}: ${originalHostname} -> ${cleanNewDomain}`);
          return url.toString();
        } else {
          console.log(`Domain not matched for ${urlStr.trim()}: ${url.hostname} !== ${cleanOldDomain}`);
          return urlStr.trim();
        }
      } catch (error) {
        console.error(`Invalid URL: ${urlStr}`, error);
        invalidUrlCount++;
        return urlStr.trim() + ' (無効なURL)';
      }
    });

    const newOutput = replacedUrlsArray.join('\n');
    console.log("Prepared new output string:", JSON.stringify(newOutput)); // Log the exact string
    
    // *** CRITICAL STEP: Update the state ***
    setOutputUrls(newOutput);
    console.log("Called setOutputUrls. State update is queued by React.");

    // Add to history (using cleaned domains)
    const newHistoryEntry: HistoryEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      inputUrls,
      oldDomain: cleanOldDomain, // Save cleaned version
      newDomain: cleanNewDomain, // Save cleaned version
    };
    console.log("Adding to history:", newHistoryEntry);
    setHistory(prevHistory => [newHistoryEntry, ...prevHistory.slice(0, 19)]);

    if (invalidUrlCount > 0) {
       toast.warning(`${invalidUrlCount}件の無効なURLが含まれていました。`);
    }
    toast.success('URLのドメインを置換しました。');
    console.log("--- handleReplace END ---");
  };

  // --- Clear Inputs Logic --- 
  const handleClearInputs = () => {
    setInputUrls('');
    setOldDomain('');
    setNewDomain('');
    setOutputUrls('');
    toast.info('入力内容をクリアしました。');
    console.log("Cleared all input and output fields.");
  };

  // --- Copy Logic --- 
  const handleCopy = () => {
    if (!outputUrls) {
      toast.error('コピーする内容がありません。');
      return;
    }
    navigator.clipboard.writeText(outputUrls)
      .then(() => {
        toast.success('変換後のURLをクリップボードにコピーしました。');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        toast.error('クリップボードへのコピーに失敗しました。');
      });
  };

  // --- History Logic --- 
  const loadFromHistory = (entryId: string) => {
    const entry = history.find(h => h.id === entryId);
    if (entry) {
      setInputUrls(entry.inputUrls);
      setOldDomain(entry.oldDomain); // Already cleaned when saved
      setNewDomain(entry.newDomain); // Already cleaned when saved
      setOutputUrls(''); // Clear output when loading history
      toast.info('履歴から設定を読み込みました。');
    }
  };

  const deleteHistoryEntry = (entryId: string) => {
    setHistory(prevHistory => prevHistory.filter(h => h.id !== entryId));
    toast.success('履歴エントリを削除しました。');
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('domainReplacerHistory'); 
    toast.success('すべての履歴を削除しました。');
  };

  // --- Preset Logic --- 
  const savePreset = () => {
    const cleanOldDomain = removeProtocol(oldDomain.trim());
    const cleanNewDomain = removeProtocol(newDomain.trim());

    if (!presetName || !cleanOldDomain || !cleanNewDomain) {
      toast.error('プリセット名と両方のドメインを入力してください。');
      return;
    }
    // Check for duplicate preset name
    if (presets.some(p => p.name === presetName)) {
      toast.error(`プリセット名「${presetName}」は既に使用されています。`);
      return;
    }
    const newPreset: PresetEntry = {
      id: Date.now().toString(),
      name: presetName,
      oldDomain: cleanOldDomain, // Save cleaned version
      newDomain: cleanNewDomain, // Save cleaned version
    };
    setPresets(prevPresets => [...prevPresets, newPreset]);
    setPresetName(''); // Clear preset name input
    // Update domain fields to cleaned versions if they changed
    setOldDomain(cleanOldDomain);
    setNewDomain(cleanNewDomain);
    toast.success(`プリセット「${presetName}」を保存しました。`);
  };

  const loadPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setOldDomain(preset.oldDomain); // Already cleaned when saved
      setNewDomain(preset.newDomain); // Already cleaned when saved
      toast.info(`プリセット「${preset.name}」を読み込みました。`);
    }
  };

  const deletePreset = (presetId: string) => {
    setPresets(prevPresets => prevPresets.filter(p => p.id !== presetId));
    toast.success('プリセットを削除しました。');
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl flex flex-col lg:flex-row gap-6">
      <Toaster richColors position="top-center" />

      {/* Main Content Area */} 
      <div className="flex-grow">
        <h1 className="text-2xl font-bold mb-6 text-center">URLドメイン一括置換ツール</h1>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <div>
            <Label htmlFor="inputUrls">置換したいURL（複数行入力可）</Label>
            <Textarea
              id="inputUrls"
              placeholder="https://example.com/page1\nhttp://sub.example.com/page2\nhttps://another.net/resource"
              value={inputUrls}
              onChange={(e) => setInputUrls(e.target.value)}
              rows={10} // Increased rows
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="oldDomain">置換前のドメイン</Label>
              <div className="flex items-center gap-2 mt-1">
                 <Input
                  id="oldDomain"
                  placeholder="example.com"
                  value={oldDomain}
                  onChange={handleOldDomainChange} // Use handler
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setAutoExtractEnabled(!autoExtractEnabled)}
                  title={autoExtractEnabled ? "ドメイン自動抽出を無効化" : "ドメイン自動抽出を有効化"}
                >
                  {autoExtractEnabled ? <ListChecks className="h-4 w-4 text-green-600" /> : <ListChecks className="h-4 w-4 text-gray-400" />}
                </Button>
              </div>
               <p className="text-xs text-muted-foreground mt-1">ドメイン自動抽出: {autoExtractEnabled ? '有効' : '無効'}</p>
            </div>
            <div>
              <Label htmlFor="newDomain">置換後のドメイン</Label>
              <Input
                id="newDomain"
                placeholder="new-example.com"
                value={newDomain}
                onChange={handleNewDomainChange} // Use handler
                className="mt-1"
              />
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
             <Button onClick={handleReplace} className="flex-grow text-lg py-3">ドメインを置換</Button>
             <Button onClick={handleClearInputs} variant="outline" className="sm:w-auto" title="入力と結果をクリア">
               <XCircle className="h-4 w-4 mr-2" />
               クリア
             </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="outputUrls">変換後のURL</Label>
          <Textarea
            id="outputUrls"
            value={outputUrls} // Ensure this value prop is correctly bound
            readOnly
            rows={10} // Increased rows
            className="mt-1 bg-gray-100 dark:bg-gray-800"
          />
        </div>

        <Button onClick={handleCopy} variant="outline" className="mt-4 w-full">結果をコピー</Button>
      </div>

      {/* Sidebar Area for History and Presets */} 
      <div className="w-full lg:w-80 flex-shrink-0 space-y-6">
        {/* Presets Section */} 
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Save className="h-5 w-5"/>プリセット</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="プリセット名"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <Button onClick={savePreset} size="icon" title="現在のドメイン設定をプリセットとして保存"><Save className="h-4 w-4"/></Button>
            </div>
            {presets.length > 0 ? (
              <Select onValueChange={loadPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="プリセットを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name} ({preset.oldDomain} → {preset.newDomain})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">保存されたプリセットはありません。</p>
            )}
             {/* Simple list for deleting presets */} 
            {presets.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1 border-t pt-2 mt-2">
                <p className="text-xs text-muted-foreground mb-1">プリセット削除:</p>
                {presets.map((preset) => (
                  <div key={`del-${preset.id}`} className="flex justify-between items-center text-sm">
                    <span>{preset.name}</span>
                    <Button variant="ghost" size="icon" onClick={() => deletePreset(preset.id)} title={`プリセット「${preset.name}」を削除`}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History Section */} 
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><History className="h-5 w-5"/>変換履歴</span>
              {history.length > 0 && (
                 <Button variant="destructive" size="sm" onClick={clearHistory} title="すべての履歴を削除">
                   <Trash2 className="h-4 w-4 mr-1"/>クリア
                 </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length > 0 ? (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {history.map((entry) => (
                  <div key={entry.id} className="border p-2 rounded-md text-sm flex justify-between items-start">
                    <div>
                      <p className="font-medium">{entry.oldDomain} → {entry.newDomain}</p>
                      <p className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground truncate w-48">入力: {entry.inputUrls.split('\n')[0]}...</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button variant="outline" size="sm" onClick={() => loadFromHistory(entry.id)} title="この履歴を読み込む">読込</Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteHistoryEntry(entry.id)} title="この履歴を削除">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">履歴はありません。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;


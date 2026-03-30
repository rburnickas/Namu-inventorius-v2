import React, { useState, useEffect, useRef } from 'react';
import { Plus, Image as ImageIcon, MapPin, Tag, Search, Check, X, Filter, Edit2, Trash2, Sparkles, Printer, Download, Upload, Loader2 } from 'lucide-react';

// --- Firebase importai ---
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // Importuojame iš jūsų sukurto firebase.js failo

export default function App() {
  const [items, setItems] = useState([]);
  const [isDbLoading, setIsDbLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]); 
  const [editingId, setEditingId] = useState(null);

  // AI raktas lieka localStorage, nes tai privatus vartotojo nustatymas
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('naujas_gemini_api_key') || '');
  const [showApiModal, setShowApiModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [categories, setCategories] = useState(['Elektronika', 'Baldai', 'Virtuvės reikmenys', 'Drabužiai', 'Kita']);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const [locations, setLocations] = useState(['Svetainė', 'Miegamasis', 'Virtuvė', 'Vonia', 'Garažas', 'Rūsys']);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterLocation, setFilterLocation] = useState('Visos');
  const fileInputRef = useRef(null);

  // 1. Duomenų sinchronizacija su Firebase
  useEffect(() => {
    // Klausomės daiktų kolekcijos
    const unsubscribeItems = onSnapshot(collection(db, "items"), (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Rūšiuojame nuo naujausio
      itemsData.sort((a, b) => b.createdAt - a.createdAt);
      setItems(itemsData);
      setIsDbLoading(false);
    }, (error) => {
      console.error("Firestore klaida:", error);
      setIsDbLoading(false);
      alert("Nepavyko prisijungti prie duomenų bazės. Patikrinkite interneto ryšį.");
    });

    // Klausomės kategorijų ir vietovių nustatymų
    const unsubscribeSettings = onSnapshot(doc(db, "settings", "metadata"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.categories) {
          setCategories(data.categories);
        }
        if (data.locations) {
          setLocations(data.locations);
        }
      } else {
        // Sukuriame pradinį dokumentą bazėje, jei jo dar nėra
        setDoc(doc(db, "settings", "metadata"), {
          categories: ['Elektronika', 'Baldai', 'Virtuvės reikmenys', 'Drabužiai', 'Kita'],
          locations: ['Svetainė', 'Miegamasis', 'Virtuvė', 'Vonia', 'Garažas', 'Rūsys']
        });
      }
    });

    return () => {
      unsubscribeItems();
      unsubscribeSettings();
    };
  }, []);

  // Pradinės reikšmės išskleidžiamiems meniu
  useEffect(() => {
    if (!selectedCategory && categories.length > 0) setSelectedCategory(categories[0]);
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (!selectedLocation && locations.length > 0) setSelectedLocation(locations[0]);
  }, [locations, selectedLocation]);

  // 2. Kategorijų ir lokacijų išsaugojimas Firebase
  const handleAddCategory = async () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      const updatedCategories = [...categories, newCategory.trim()];
      await setDoc(doc(db, "settings", "metadata"), { categories: updatedCategories }, { merge: true });
      setSelectedCategory(newCategory.trim());
    }
    setNewCategory('');
    setIsAddingCategory(false);
  };

  const handleAddLocation = async () => {
    if (newLocation.trim() && !locations.includes(newLocation.trim())) {
      const updatedLocations = [...locations, newLocation.trim()];
      await setDoc(doc(db, "settings", "metadata"), { locations: updatedLocations }, { merge: true });
      setSelectedLocation(newLocation.trim());
    }
    setNewLocation('');
    setIsAddingLocation(false);
  };

  const processImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; 
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    if (photos.length + files.length > 5) {
      alert("Vienam daiktui galima pridėti daugiausiai 5 nuotraukas.");
      return;
    }

    try {
      const compressedPhotos = await Promise.all(files.map(file => processImage(file)));
      setPhotos(prev => [...prev, ...compressedPhotos]);
    } catch (error) {
      alert("Įvyko klaida bandant apdoroti nuotrauką.");
    }
    e.target.value = '';
  };

  const removePhoto = (indexToRemove) => {
    setPhotos(photos.filter((_, index) => index !== indexToRemove));
  };

  // --- AI Aprašymas ---
  const saveApiKey = () => {
    if (!tempApiKey.trim()) return;
    localStorage.setItem('naujas_gemini_api_key', tempApiKey.trim());
    setApiKey(tempApiKey.trim());
    setShowApiModal(false);
    setTempApiKey('');
    alert("Naujas API raktas sėkmingai išsaugotas!");
  };

  const clearApiKey = () => {
    localStorage.removeItem('naujas_gemini_api_key');
    setApiKey('');
    alert("Raktas sėkmingai pašalintas iš atminties!");
  };

  const handleGenerateDescription = async () => {
    if (photos.length === 0) {
      alert("Pirmiausia pridėkite nuotrauką.");
      return;
    }
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    setIsGenerating(true);
    try {
      const photoDataUrl = photos[0]; 
      if (!photoDataUrl.startsWith('data:')) {
         alert("AI aprašymą galima generuoti tik naujai įkeltoms nuotraukoms. Ištrinkite seną nuotrauką iš šio daikto, įkelkite ją iš naujo ir bandykite dar kartą.");
         setIsGenerating(false);
         return;
      }

      const base64Data = photoDataUrl.split(',')[1];
      const mimeType = photoDataUrl.substring(photoDataUrl.indexOf(':') + 1, photoDataUrl.indexOf(';'));

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Trumpai, 1-2 sakiniais aprašyk, koks tai daiktas, kokia jo būklė (jei matosi) ir kokios jo pagrindinės vizualinės savybės. Rašyk tiksliai, lietuvių kalba." },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }]
        })
      });

      if (!response.ok) throw new Error("Nepavyko susisiekti su Google AI.");

      const data = await response.json();
      const generatedText = data.candidates[0].content.parts[0].text;
      
      setDescription(prev => prev ? prev + "\n" + generatedText : generatedText);
    } catch (error) {
      alert(`Klaida generuojant aprašymą. Patikrinkite API raktą.`);
      setShowApiModal(true);
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Išsaugojimas Firebase tik per Firestore (Base64)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSaving(true);
    try {
      if (editingId) {
        // Atnaujiname esamą
        const itemRef = doc(db, "items", editingId);
        await updateDoc(itemRef, {
          name,
          category: selectedCategory,
          location: selectedLocation,
          description,
          photos: photos, // Saugome Base64 stringus tiesiai Firestore
          updatedAt: Date.now()
        });
      } else {
        // Sukuriame naują
        await addDoc(collection(db, "items"), {
          name,
          category: selectedCategory,
          location: selectedLocation,
          description,
          photos: photos, // Saugome Base64 stringus tiesiai Firestore
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      
      setName('');
      setDescription('');
      setPhotos([]);
      setEditingId(null);
    } catch (error) {
      alert("Nepavyko išsaugoti daikto: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item) => {
    setName(item.name);
    setSelectedCategory(item.category);
    setSelectedLocation(item.location);
    setDescription(item.description || '');
    setPhotos(item.photos || (item.photoUrl ? [item.photoUrl] : []));
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPhotos([]);
  };

  // 4. Trynimas tik iš Firestore
  const handleDeleteItem = async (idToDelete) => {
    if (window.confirm("Ar tikrai norite ištrinti šį daiktą ir visas jo nuotraukas iš debesies?")) {
      try {
        await deleteDoc(doc(db, "items", idToDelete));
      } catch (error) {
        alert("Klaida trinant daiktą.");
      }
    }
  };

  // Eksportas lieka (iš debesies į JSON failą)
  const handleExportData = () => {
    const dataToExport = { items, categories, locations, exportDate: new Date().toISOString() };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "inventorius_atsargine_kopija.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Importas įkelia daiktus tiesiai į Firebase
  const handleImportData = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (importedData.items && Array.isArray(importedData.items)) {
          if (window.confirm("Ar tikrai norite importuoti duomenis? Visi failo daiktai bus pridėti į debesį.")) {
            setIsDbLoading(true);
            for (const item of importedData.items) {
               await addDoc(collection(db, "items"), {
                  name: item.name,
                  category: item.category,
                  location: item.location,
                  description: item.description || '',
                  photos: item.photos || (item.photoUrl ? [item.photoUrl] : []),
                  createdAt: Date.now(),
                  updatedAt: Date.now()
               });
            }
            alert("Duomenys sėkmingai importuoti ir išsaugoti debesyje!");
            setIsDbLoading(false);
          }
        }
      } catch (error) {
        alert("Įvyko klaida importuojant duomenis.");
        setIsDbLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredItems = items.filter(item => {
    const queryMatch = searchQuery === '' || (
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    const locationMatch = filterLocation === 'Visos' || item.location === filterLocation;
    return queryMatch && locationMatch;
  });

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <style>
        {`
          @media print {
            body { background-color: white !important; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            .shadow-sm, .shadow-md { box-shadow: none !important; }
            .border { border: 1px solid #e5e7eb !important; }
            .bg-gray-50 { background-color: white !important; }
            .print-page-break { page-break-inside: avoid; margin-bottom: 20px; }
            h1 { font-size: 24pt !important; margin-bottom: 20px !important; }
          }
        `}
      </style>

      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-gray-800 text-center sm:text-left flex items-center gap-2">
          Namų Ūkio Inventorius
          {isDbLoading && <Loader2 size={24} className="animate-spin text-blue-500 no-print" />}
        </h1>
        
        <div className="flex gap-2 no-print w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap shadow-sm">
            <Printer size={16} /><span>PDF / Spausdinti</span>
          </button>
          
          <button onClick={handleExportData} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap shadow-sm">
            <Download size={16} /><span>Eksportuoti</span>
          </button>
          
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap shadow-sm">
            <Upload size={16} /><span>Importuoti</span>
          </button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportData} className="hidden" />
        </div>
      </div>

      <div className={`no-print p-6 rounded-xl shadow-md mb-8 border ${editingId ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
        <h2 className={`text-xl font-semibold mb-4 ${editingId ? 'text-yellow-800' : 'text-gray-700'}`}>
          {editingId ? 'Redaguoti daiktą' : 'Pridėti naują daiktą'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pavadinimas</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                placeholder="Pvz.: Kavos aparatas"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nuotraukos ({photos.length}/5)</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                disabled={isSaving}
                className="w-full p-1.5 border border-gray-300 rounded-md bg-white text-sm file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={isGenerating || isSaving}
                className="w-full mt-3 p-3 bg-purple-100 text-purple-700 font-bold rounded-lg border border-purple-300 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {isGenerating ? 'AI galvoja...' : 'Sugeneruoti AI aprašymą'}
              </button>

              {photos.length > 0 && (
                <div className="flex flex-col gap-3 mt-3">
                  <div className="flex flex-wrap gap-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative group w-16 h-16 rounded-md overflow-hidden border border-gray-200">
                        <img src={photo} alt={`Įkelta ${index}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute top-0 right-0 p-1 bg-red-500 text-white opacity-80 hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategorija</label>
              <div className="flex gap-2">
                {isAddingCategory ? (
                  <div className="flex-1 flex gap-1">
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="flex-1 p-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Nauja..."
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                    />
                    <button type="button" onClick={handleAddCategory} className="p-2 bg-green-500 text-white rounded-md hover:bg-green-600"><Check size={20} /></button>
                    <button type="button" onClick={() => setIsAddingCategory(false)} className="p-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"><X size={20} /></button>
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      {categories.map((cat, index) => (<option key={index} value={cat}>{cat}</option>))}
                    </select>
                    <button type="button" onClick={() => setIsAddingCategory(true)} className="p-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"><Plus size={20} /></button>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buvimo vieta</label>
              <div className="flex gap-2">
                {isAddingLocation ? (
                  <div className="flex-1 flex gap-1">
                    <input
                      type="text"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      className="flex-1 p-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Nauja..."
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLocation())}
                    />
                    <button type="button" onClick={handleAddLocation} className="p-2 bg-green-500 text-white rounded-md hover:bg-green-600"><Check size={20} /></button>
                    <button type="button" onClick={() => setIsAddingLocation(false)} className="p-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"><X size={20} /></button>
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedLocation}
                      onChange={(e) => setSelectedLocation(e.target.value)}
                      className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      {locations.map((loc, index) => (<option key={index} value={loc}>{loc}</option>))}
                    </select>
                    <button type="button" onClick={() => setIsAddingLocation(true)} className="p-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"><Plus size={20} /></button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="block text-sm font-medium text-gray-700">Aprašymas (neprivaloma)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              placeholder="Gamintojas, modelis, būklė..."
              rows="3"
            />
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              disabled={isSaving}
              className={`flex-1 text-white py-2 px-4 rounded-md transition duration-200 font-medium flex items-center justify-center gap-2 ${editingId ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50`}
            >
              {isSaving && <Loader2 size={18} className="animate-spin" />}
              {isSaving ? 'Saugoma...' : (editingId ? 'Atnaujinti daiktą' : 'Pridėti daiktą')}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isSaving}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition duration-200 font-medium disabled:opacity-50"
              >
                Atšaukti
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="mb-8 print-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-700 flex justify-between items-center">
          <span>Debesies Inventorius ({items.length})</span>
        </h2>
        
        {items.length > 0 && (
          <div className="no-print flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                placeholder="Ieškoti..."
              />
            </div>
            
            <div className="relative md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-5 w-5 text-gray-400" />
              </div>
              <select
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm appearance-none"
              >
                <option value="Visos">Visos vietos</option>
                {locations.map((loc, index) => (
                  <option key={index} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {isDbLoading ? (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-3">
             <Loader2 size={32} className="animate-spin text-blue-500" />
             <p className="text-gray-500">Kraunami duomenys iš debesies...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500">Jūsų debesies inventorius kol kas tuščias.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500">Pagal jūsų paiešką nieko nerasta.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => {
              const itemPhotos = item.photos || (item.photoUrl ? [item.photoUrl] : []);
              
              return (
                <div key={item.id} className="print-page-break bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow relative group">
                  <div className="no-print absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => handleEdit(item)}
                      className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-blue-100 hover:text-blue-600"
                      title="Redaguoti"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-red-100 hover:text-red-600"
                      title="Ištrinti"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-start gap-4 mb-3">
                    {itemPhotos.length > 0 ? (
                      <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 hide-scrollbar">
                        {itemPhotos.map((photo, i) => (
                          <div key={i} className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                            <img src={photo} alt={`${item.name} ${i}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                        <ImageIcon className="text-gray-400" size={32} />
                      </div>
                    )}
                    
                    <div className="flex-1 pr-16 mt-2 sm:mt-0">
                      <h3 className="font-semibold text-lg text-gray-800">{item.name}</h3>
                      <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                        <Tag size={14} className="text-blue-500" />
                        <span>{item.category}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                        <MapPin size={14} className="text-red-500" />
                        <span>{item.location}</span>
                      </div>
                    </div>
                  </div>
                  {item.description && (
                    <div className="mt-auto pt-3 border-t border-gray-100 text-sm text-gray-600 bg-blue-50/50 p-2 rounded whitespace-pre-line">
                      {item.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI API Modal */}
      {showApiModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-full">
                <Sparkles size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Dirbtinio intelekto sąranka</h3>
            </div>
            
            <p className="text-gray-600 mb-4 text-sm">
              Kad programa galėtų analizuoti nuotraukas, reikalingas nemokamas <strong>Google Gemini API raktas</strong>. Kadangi programėlė veikia tik jūsų telefone, šį raktą turite nurodyti patys.
            </p>
            
            <input
              type="text"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-gray-50"
            />

            <div className="flex gap-3">
              <button onClick={saveApiKey} className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 font-medium transition-colors">
                Išsaugoti raktą
              </button>
              <button onClick={() => setShowApiModal(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 font-medium transition-colors">
                Atšaukti
              </button>
            </div>
            
            {apiKey && (
               <button onClick={clearApiKey} className="w-full mt-4 text-sm text-red-500 hover:text-red-700 font-medium">
                 Pašalinti seną išsaugotą raktą
               </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { PhotoList } from './components/PhotoList';
import { ConfigPanel } from './components/ConfigPanel';
import { DocumentPreview } from './components/DocumentPreview';
import { ExportToolbar } from './components/ExportToolbar';
import { XmlModal } from './components/XmlModal';
import { GridConfig, PhotoItem } from './types';
import { calculateLayout, generateDocxBlob, generateDocumentXml, expandPhotosWithCopies } from './utils/openXmlGenerator';
import { processImageToBlob, generateSamplePhotoFile } from './utils/imageProcessor';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const INITIAL_CONFIG: GridConfig = {
  unit: 'cm',
  targetWidthCm: 3.0,
  targetHeightCm: 4.0,
  resizeMode: 'smart_crop',
  autoRotateMode: 'keep',
  sizeLayoutMode: 'uniform',
  rowConfigs: [
    { id: 'row_1', widthCm: 4.0, heightCm: 6.0, columnsMode: 'auto', customColumns: 3 },
    { id: 'row_2', widthCm: 3.0, heightCm: 4.0, columnsMode: 'auto', customColumns: 4 },
    { id: 'row_3', widthCm: 2.0, heightCm: 3.0, columnsMode: 'auto', customColumns: 6 },
  ],
  paperType: 'A4',
  customPaperWidthCm: 21.0,
  customPaperHeightCm: 29.7,
  orientation: 'portrait',
  margins: {
    topCm: 1.5,
    bottomCm: 1.5,
    leftCm: 1.5,
    rightCm: 1.5,
  },
  gutterCm: 0.3,
  rowSpacingCm: 0.4,
  columnsMode: 'auto',
  customColumns: 4,
  showCutGuides: true,
  showLabels: false,
  labelType: 'filename',
  backgroundColor: '#FFFFFF',
  dpi: 300,
};

interface PhotoGridViewProps {
  onExportComplete?: (fileName: string) => void;
}

export const PhotoGridView: React.FC<PhotoGridViewProps> = ({ onExportComplete }) => {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [config, setConfig] = useState<GridConfig>(INITIAL_CONFIG);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Re-process photos whenever size or resizeMode changes
  useEffect(() => {
    if (photos.length === 0) return;

    let isMounted = true;

    const reprocessAll = async () => {
      const updatedPhotos = await Promise.all(
        photos.map(async (p) => {
          try {
            const { dataUrl, blob } = await processImageToBlob(p.dataUrl, {
              widthCm: config.targetWidthCm,
              heightCm: config.targetHeightCm,
              mode: config.resizeMode,
              autoRotateMode: config.autoRotateMode,
              manualRotateAngle: p.rotation || 0,
              dpi: config.dpi,
              backgroundColor: config.backgroundColor,
            });
            return {
              ...p,
              processedDataUrl: dataUrl,
              processedBlob: blob,
            };
          } catch (e) {
            console.error('Error re-processing photo:', e);
            return p;
          }
        })
      );

      if (isMounted) {
        setPhotos(updatedPhotos);
      }
    };

    reprocessAll();

    return () => {
      isMounted = false;
    };
  }, [config.targetWidthCm, config.targetHeightCm, config.resizeMode, config.autoRotateMode, config.backgroundColor]);

  // Handle uploaded files
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validImageFiles = files.filter((f) =>
      f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name)
    );

    if (validImageFiles.length === 0) return;

    const newPhotos: PhotoItem[] = [];

    for (const file of validImageFiles) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      // Get natural dimensions
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // Process initial crop/stretch
      const { dataUrl: processedDataUrl, blob: processedBlob } = await processImageToBlob(
        dataUrl,
        {
          widthCm: config.targetWidthCm,
          heightCm: config.targetHeightCm,
          mode: config.resizeMode,
          autoRotateMode: config.autoRotateMode,
          dpi: config.dpi,
          backgroundColor: config.backgroundColor,
        }
      );

      newPhotos.push({
        id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        originalWidth: img.naturalWidth || 600,
        originalHeight: img.naturalHeight || 800,
        dataUrl,
        copies: 1,
        processedDataUrl,
        processedBlob,
      });
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
    showToast(`${newPhotos.length} foto berhasil ditambahkan`);
  };

  // Load sample photos for instant testing
  const handleLoadSamples = async () => {
    const samples = [
      {
        name: 'Pas_Foto_Merah_Budi.jpg',
        bgColor: '#b91c1c',
        personColor: '#f1c27d',
        label: 'Pas Foto Budi (Merah)',
      },
      {
        name: 'Pas_Foto_Biru_Siti.jpg',
        bgColor: '#1d4ed8',
        personColor: '#e0ac69',
        label: 'Pas Foto Siti (Biru)',
      },
      {
        name: 'Pas_Foto_Merah_Ahmad.jpg',
        bgColor: '#991b1b',
        personColor: '#ffdbac',
        label: 'Pas Foto Ahmad (Merah)',
      },
      {
        name: 'Pas_Foto_Biru_Dewi.jpg',
        bgColor: '#2563eb',
        personColor: '#f1c27d',
        label: 'Pas Foto Dewi (Biru)',
      },
    ];

    const sampleFiles = await Promise.all(
      samples.map((s) =>
        generateSamplePhotoFile(s.name, s.bgColor, s.personColor, s.label)
      )
    );

    await handleFilesSelected(sampleFiles);
    showToast('4 contoh pas foto standar berhasil dimuat');
  };

  // Photo list management handlers
  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleClearAll = () => {
    setPhotos([]);
    showToast('Semua foto telah dihapus', 'info');
  };

  const handleUpdateCopies = (id: string, delta: number) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, copies: Math.max(1, (p.copies || 1) + delta) };
        }
        return p;
      })
    );
  };

  const handleSetCopies = (id: string, copies: number) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, copies: Math.max(1, copies) };
        }
        return p;
      })
    );
  };

  const handleDuplicatePhoto = (id: string) => {
    const found = photos.find((p) => p.id === id);
    if (!found) return;
    const cloned: PhotoItem = {
      ...found,
      id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${found.name.replace(/\.[^/.]+$/, '')}_copy.jpg`,
    };
    setPhotos((prev) => [...prev, cloned]);
  };

  // Manual rotation handlers for photos/KTP
  const handleRotatePhoto = async (id: string, deltaAngle: number = 90) => {
    const targetPhoto = photos.find((p) => p.id === id);
    if (!targetPhoto) return;
    const newRot = (((targetPhoto.rotation || 0) + deltaAngle) % 360 + 360) % 360;

    try {
      const { dataUrl, blob } = await processImageToBlob(targetPhoto.dataUrl, {
        widthCm: config.targetWidthCm,
        heightCm: config.targetHeightCm,
        mode: config.resizeMode,
        autoRotateMode: config.autoRotateMode,
        manualRotateAngle: newRot,
        dpi: config.dpi,
        backgroundColor: config.backgroundColor,
      });

      setPhotos((prev) =>
        prev.map((p) => {
          if (p.id === id) {
            return {
              ...p,
              rotation: newRot,
              processedDataUrl: dataUrl,
              processedBlob: blob,
            };
          }
          return p;
        })
      );
      showToast(`Foto diputar manual menjadi ${newRot}°`);
    } catch (e) {
      console.error('Gagal memutar foto:', e);
    }
  };

  const handleRotateAllPhotos = async (deltaAngle: number = 90) => {
    if (photos.length === 0) return;
    try {
      const updatedPhotos = await Promise.all(
        photos.map(async (p) => {
          const newRot = (((p.rotation || 0) + deltaAngle) % 360 + 360) % 360;
          const { dataUrl, blob } = await processImageToBlob(p.dataUrl, {
            widthCm: config.targetWidthCm,
            heightCm: config.targetHeightCm,
            mode: config.resizeMode,
            autoRotateMode: config.autoRotateMode,
            manualRotateAngle: newRot,
            dpi: config.dpi,
            backgroundColor: config.backgroundColor,
          });
          return {
            ...p,
            rotation: newRot,
            processedDataUrl: dataUrl,
            processedBlob: blob,
          };
        })
      );
      setPhotos(updatedPhotos);
      showToast(`Semua foto diputar manual (+${deltaAngle}°)`);
    } catch (e) {
      console.error('Gagal memutar semua foto:', e);
    }
  };

  // Calculate layout
  const layout = useMemo(() => {
    return calculateLayout(photos, config);
  }, [photos, config]);

  const totalCopies = useMemo(() => {
    return photos.reduce((acc, p) => acc + (p.copies || 1), 0);
  }, [photos]);

  // Generate document.xml string for modal preview
  const currentDocumentXml = useMemo(() => {
    const expanded = expandPhotosWithCopies(photos, config.labelType);
    const photoRIdMap = new Map<string, string>();
    photos.forEach((p, idx) => {
      photoRIdMap.set(p.id, `rIdImg${idx + 1}`);
    });
    return generateDocumentXml(expanded, photoRIdMap, layout, config);
  }, [photos, layout, config]);

  // Export to .docx action
  const handleExportDocx = async () => {
    if (photos.length === 0) return;

    try {
      setIsGenerating(true);
      setProgressPercent(10);
      setProgressText('Memulai pembuatan dokumen...');

      const { docxBlob } = await generateDocxBlob(photos, config, (pct, msg) => {
        setProgressPercent(pct);
        setProgressText(msg);
      });

      const fileName = `Grid_Foto_${config.targetWidthCm}x${config.targetHeightCm}cm_${config.paperType}.docx`;
      const url = URL.createObjectURL(docxBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Dokumen ${fileName} berhasil diunduh!`);
      if (onExportComplete) {
        onExportComplete(fileName);
      }
    } catch (err) {
      console.error('Export error:', err);
      showToast('Terjadi kesalahan saat mengekspor dokumen: ' + (err as Error).message, 'info');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100/60 text-neutral-900 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        onOpenXmlModal={() => setIsXmlModalOpen(true)}
        onLoadSamples={handleLoadSamples}
        hasPhotos={photos.length > 0}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Toast notification */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-neutral-900 text-white text-xs font-medium rounded-xl shadow-xl transition-all animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* Top Upload Area */}
        <UploadZone
          onFilesSelected={handleFilesSelected}
          onClearAll={handleClearAll}
          onLoadSamples={handleLoadSamples}
          photoCount={photos.length}
          totalCopies={totalCopies}
        />

        {/* Uploaded Photos Grid Manager */}
        {photos.length > 0 && (
          <PhotoList
            photos={photos}
            onRemovePhoto={handleRemovePhoto}
            onUpdateCopies={handleUpdateCopies}
            onSetCopies={handleSetCopies}
            onDuplicatePhoto={handleDuplicatePhoto}
            onRotatePhoto={handleRotatePhoto}
            onRotateAllPhotos={handleRotateAllPhotos}
          />
        )}

        {/* Main 2-Column Grid: Config Controls & Live Word Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Configuration Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <ConfigPanel
              config={config}
              onChangeConfig={setConfig}
              layout={layout}
              onRotateAllPhotos={handleRotateAllPhotos}
            />
          </div>

          {/* Right Column: Live Word Sheet Visualizer (7 cols) */}
          <div className="lg:col-span-7">
            <DocumentPreview
              photos={photos}
              config={config}
              layout={layout}
            />
          </div>
        </div>

        {/* Bottom Floating Export Toolbar */}
        <ExportToolbar
          onExportDocx={handleExportDocx}
          onOpenXmlModal={() => setIsXmlModalOpen(true)}
          isGenerating={isGenerating}
          progressPercent={progressPercent}
          progressText={progressText}
          photos={photos}
          layout={layout}
          config={config}
        />
      </main>

      {/* XML Code & Template Modal */}
      <XmlModal
        isOpen={isXmlModalOpen}
        onClose={() => setIsXmlModalOpen(false)}
        documentXml={currentDocumentXml}
        layout={layout}
        config={config}
      />
    </div>
  );
}

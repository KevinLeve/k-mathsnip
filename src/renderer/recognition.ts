import type { AppSettings, OCRResult, OutputFormat } from '../shared/types';

interface RecognitionState {
  currentImage: string | null;
  ocrResult: OCRResult | null;
  isRecognizing: boolean;
  error: string | null;
  activeTab: OutputFormat | 'image';
  currentPage: 'result' | 'settings' | 'history';
  settings: AppSettings | null;
}

interface RecognitionDependencies {
  getState: () => RecognitionState;
  setState: (state: Partial<RecognitionState>) => void;
  recognize: (image: string) => Promise<OCRResult>;
  copyText: (text: string) => Promise<void>;
  copyForWord: (latex: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  showToast: (message: string) => void;
}

// All input paths (capture, paste, drop and retry) share the same lifecycle.
export function createRecognizer(deps: RecognitionDependencies) {
  return async (imageBase64: string): Promise<void> => {
    if (deps.getState().isRecognizing) {
      deps.showToast('Recognition in progress. Please wait.');
      return;
    }
    const format = deps.getState().settings?.defaultOutputFormat ?? 'latex';
    deps.setState({
      currentImage: imageBase64,
      ocrResult: null,
      error: null,
      isRecognizing: true,
      currentPage: 'result',
    });

    try {
      const result = await deps.recognize(imageBase64);
      deps.setState({ ocrResult: result, activeTab: format });
      const notifications: string[] = [];
      // Word is the star feature: auto-copy a real editable equation whenever the recognized
      // LaTeX supports it, so pasting into Word needs nothing but Ctrl+V after a snip. Only
      // fall back to a plain-text copy (the user's chosen default format) when that genuinely
      // isn't possible — never silently skip copying something.
      if (result.latex) {
        try {
          const wordResult = await deps.copyForWord(result.latex);
          if (wordResult.ok) {
            notifications.push('Copied — press Ctrl+V in Word for a real editable equation.');
          } else if (result[format]) {
            await deps.copyText(result[format]);
            notifications.push(`Copied as ${format.toUpperCase()} (couldn't build a Word equation from this one).`);
          }
        } catch {
          // Clipboard access can fail independently of a successful OCR request.
          notifications.push('Recognized successfully. Copy failed; use the Copy button to retry.');
        }
      }
      if (result.warning) notifications.push(result.warning);
      if (notifications.length) deps.showToast(notifications.join(' '));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recognition failed';
      deps.setState({
        error: message.replace(/^Error invoking remote method 'ocr:recognize': (?:Error: )?/, ''),
      });
    } finally {
      deps.setState({ isRecognizing: false });
    }
  };
}

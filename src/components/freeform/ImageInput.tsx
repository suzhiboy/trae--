import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, ScanSearch } from 'lucide-react';
import { requestImageRecognition, type FreeformFailure } from '../../services/freeformDiagnosis';
import type { OcrResult } from '../../types';

export default function ImageInput({
  disabled,
  onStart,
  onRecognized,
  onError,
  onFileSelected,
}: {
  disabled: boolean;
  onStart: () => void;
  onRecognized: (result: OcrResult) => void;
  onError: (failure: FreeformFailure) => void;
  onFileSelected: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = () => {
    if (!disabled) input.current?.click();
  };

  const selectFile = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    if (!next) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type)) {
      setLocalError('请上传 JPG、PNG 或 WebP 图片。');
      return;
    }
    if (next.size > 12 * 1024 * 1024) {
      setLocalError('图片超过 12MB，请压缩或重新拍照。');
      return;
    }
    setLocalError('');
    setFile(next);
    setPreview(URL.createObjectURL(next));
    onFileSelected();
  };

  const recognize = async () => {
    if (!file || busy || disabled) return;
    setBusy(true);
    setLocalError('');
    onStart();
    const response = await requestImageRecognition(file);
    setBusy(false);
    if (response.ok) {
      onRecognized(response.result);
    } else {
      onError(response);
    }
  };

  return (
    <div className="freeform-image">
      <div className="freeform-image__head">
        <span>拍照 / 上传</span>
        <small>识别结果先确认，再诊断</small>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        capture="environment"
        className="freeform-file-input"
        aria-label="选择题目图片"
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="freeform-image__preview">
          <img src={preview} alt="待识别的题目或手写步骤" />
          <div>
            <span>{file?.name || '已选择图片'}</span>
            <button type="button" className="practice-text-button" onClick={choose} disabled={disabled || busy}>
              <RotateCcw aria-hidden="true" />重新选择
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="freeform-image__drop"
          onClick={choose}
          disabled={disabled || busy}
        >
          <Camera aria-hidden="true" />
          <strong>拍照或上传题目</strong>
          <span>支持 JPG / PNG / WebP；手写步骤也可一起拍进去</span>
        </button>
      )}

      {preview && (
        <button
          type="button"
          className="outline-button freeform-image__recognize"
          onClick={recognize}
          disabled={disabled || busy}
        >
          <ScanSearch aria-hidden="true" />
          {busy ? '正在识别…' : '识别图片'}
        </button>
      )}

      {localError && <p className="freeform-image__error" role="alert">{localError}</p>}
      <p className="freeform-image__note">
        图片会发送到服务端模型做转录，仅用于本次识别；不会写入本机历史记录。
      </p>
    </div>
  );
}

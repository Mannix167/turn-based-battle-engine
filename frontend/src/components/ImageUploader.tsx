import React, { useRef, useState } from 'react'

interface ImageUploaderProps {
  label: string
  currentUrl: string | null
  onUploaded: (url: string) => void
  uploadFn: (file: File) => Promise<string>
}

export default function ImageUploader({
  label,
  currentUrl,
  onUploaded,
  uploadFn,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const url = await uploadFn(file)
      onUploaded(url)
    } catch {
      setUploadError('上传失败，请重试')
    } finally {
      setUploading(false)
      // 重置 input，允许重复选同一文件
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="image-uploader">
      <div className="image-uploader-label">{label}</div>
      <div className="image-uploader-preview">
        {currentUrl ? (
          <img src={currentUrl} alt={label} className="image-preview" />
        ) : (
          <div className="image-preview-empty">未上传</div>
        )}
      </div>
      <div className="image-uploader-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '上传中...' : '选择图片'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      {uploadError && <div className="upload-error">{uploadError}</div>}
    </div>
  )
}

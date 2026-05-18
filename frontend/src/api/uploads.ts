import axios from 'axios'

async function uploadFile(file: File, endpoint: string): Promise<string> {
  const buffer = await file.arrayBuffer()
  const res = await axios.post<{ url: string }>(
    `${endpoint}?filename=${encodeURIComponent(file.name)}`,
    buffer,
    {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    }
  )
  return res.data.url
}

export async function uploadPortrait(file: File): Promise<string> {
  return uploadFile(file, '/api/uploads/portrait')
}

export async function uploadToken(file: File): Promise<string> {
  return uploadFile(file, '/api/uploads/token')
}

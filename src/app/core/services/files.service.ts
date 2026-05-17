import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import type { Attachment } from '../../types';

const TEXT_EXTENSIONS = /\\.(txt|md|js|ts|jsx|tsx|json|html|css|py|java|c|cpp|h)$/i;
const IMAGE_EXTENSIONS = /\\.(png|jpe?g|webp|heic|heif)$/i;

function getImageMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}

@Injectable({ providedIn: 'root' })
export class FileProcessingService {
  async processFile(file: File): Promise<Attachment[]> {
    if (file.name.endsWith('.zip')) {
      return this.processZipFile(file);
    }
    if (file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name)) {
      return [await this.processImageFile(file)];
    }
    if (TEXT_EXTENSIONS.test(file.name) || file.type.startsWith('text/')) {
      return [await this.processTextFile(file)];
    }
    console.warn(`Unsupported file type: ${file.name}`);
    return [];
  }

  private async processImageFile(file: File): Promise<Attachment> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        resolve({
          name: file.name,
          data: base64,
          mimeType: file.type || getImageMimeType(file.name),
          isText: false,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private async processTextFile(file: File): Promise<Attachment> {
    const text = await file.text();
    return {
      name: file.name,
      data: text,
      mimeType: 'text/plain',
      isText: true,
    };
  }

  private async processZipFile(file: File): Promise<Attachment[]> {
    const zip = new JSZip();
    const attachments: Attachment[] = [];
    try {
      const zipContent = await zip.loadAsync(file);
      const entries = Object.values(zipContent.files);

      for (const entry of entries) {
        if (entry.dir) continue;
        if (TEXT_EXTENSIONS.test(entry.name)) {
          const text = await entry.async('string');
          attachments.push({
            name: entry.name,
            data: text,
            mimeType: 'text/plain',
            isText: true,
          });
        } else if (IMAGE_EXTENSIONS.test(entry.name)) {
          const base64 = await entry.async('base64');
          attachments.push({
            name: entry.name,
            data: base64,
            mimeType: getImageMimeType(entry.name),
            isText: false,
          });
        }
      }
    } catch (error) {
      console.error('Error unzipping file:', error);
    }
    return attachments;
  }

  async processFiles(files: FileList): Promise<Attachment[]> {
    const results = await Promise.all(
      Array.from(files).map((file) => this.processFile(file))
    );
    return results.flat();
  }
}

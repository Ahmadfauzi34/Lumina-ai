export interface Attachment {
  name: string;
  data: string; // base64 for images, raw text for text files
  mimeType: string;
  isText: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isStreaming?: boolean;
  attachments?: Attachment[];
  thinkSession?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  model: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  input: string;
  attachments: Attachment[];
}

export interface SendMessagePayload {
  text: string;
  attachments: Attachment[];
}

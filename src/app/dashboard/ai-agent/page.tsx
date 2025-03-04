import { Metadata } from 'next';
import DashboardLayout from '@/components/DashboardLayout';
import AIAgentChat from '@/components/AIAgentChat';

export const metadata: Metadata = {
  title: 'AI Agent - Voice Chat',
  description: 'Chat with your AI assistant using voice commands.',
};

export default function AIAgentPage() {
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-6rem)] flex flex-col">
        <div className="flex-none px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">AI Voice Assistant</h1>
          <p className="mt-1 text-sm text-gray-500">
            Speak with your AI assistant using natural voice commands. Click the button below to start speaking.
          </p>
        </div>
        
        <div className="flex-1 px-4 sm:px-6 lg:px-8 pb-4">
          <AIAgentChat />
        </div>
      </div>
    </DashboardLayout>
  );
} 
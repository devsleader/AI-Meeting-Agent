import { Metadata } from 'next';
import DashboardLayout from '@/components/DashboardLayout';

export const metadata: Metadata = {
  title: 'Dashboard - AI Meeting Assistant',
  description: 'View your meetings and interact with your AI assistant.',
};

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

        <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Quick Actions</dt>
                    <dd className="mt-1">
                      <a href="/dashboard/ai-agent" className="text-sm text-indigo-600 hover:text-indigo-900">
                        Schedule a new meeting →
                      </a>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Upcoming Meetings</dt>
                    <dd className="mt-1">
                      <a href="/dashboard/meetings" className="text-sm text-indigo-600 hover:text-indigo-900">
                        View all meetings →
                      </a>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">AI Assistant</dt>
                    <dd className="mt-1">
                      <a href="/dashboard/ai-agent" className="text-sm text-indigo-600 hover:text-indigo-900">
                        Chat with assistant →
                      </a>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
          <div className="mt-4 bg-white shadow rounded-lg">
            <div className="p-6">
              <p className="text-sm text-gray-500">No recent activity to display.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
} 
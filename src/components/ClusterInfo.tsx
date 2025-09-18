'use client';

import { useState, useEffect } from 'react';
import { Server, RefreshCw } from 'lucide-react';

interface ClusterData {
  brokers: Array<{
    nodeId: number;
    host: string;
    port: number;
  }>;
  topics: number;
  controllerBroker?: {
    nodeId: number;
    host: string;
    port: number;
  };
}

export default function ClusterInfo() {
  const [clusterData, setClusterData] = useState<ClusterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClusterInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cluster');
      if (!response.ok) {
        throw new Error('Failed to fetch cluster information');
      }
      const data = await response.json();
      setClusterData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusterInfo();
  }, []);

  if (loading && !clusterData) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Loading cluster information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Error loading cluster information
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Cluster Information
        </h2>
        <button
          onClick={fetchClusterInfo}
          disabled={loading}
          className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {clusterData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cluster Overview */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Overview
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Total Brokers:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {clusterData.brokers.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Total Topics:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {clusterData.topics}
                </span>
              </div>
              {clusterData.controllerBroker && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">Controller:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {clusterData.controllerBroker.host}:{clusterData.controllerBroker.port}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Brokers List */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Brokers
            </h3>
            <div className="space-y-3">
              {clusterData.brokers.map((broker) => (
                <div
                  key={broker.nodeId}
                  className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md"
                >
                  <div className="flex items-center">
                    <Server className="w-5 h-5 text-gray-400 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        Broker {broker.nodeId}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {broker.host}:{broker.port}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Online</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

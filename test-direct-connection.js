const { Kafka } = require('kafkajs');

async function testLocalhost() {
  console.log('Testing localhost connection (WSL2 port forwarding)...');
  console.log('bootstrap.servers=localhost:9092');
  console.log('');
  
  const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['localhost:9092'],
    retry: {
      initialRetryTime: 300,
      retries: 3,
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  });

  const admin = kafka.admin();
  
  try {
    console.log('🔄 Attempting connection to localhost:9092...');
    await admin.connect();
    console.log('✅ Successfully connected to Kafka via localhost!');
    
    console.log('📋 Fetching topic list...');
    const topics = await admin.listTopics();
    console.log('Topics found:', topics);
    
    console.log('ℹ️  Fetching cluster metadata...');
    const metadata = await admin.fetchTopicMetadata();
    console.log('Cluster info:', {
      topics: metadata.topics.length,
      topicNames: metadata.topics.map(t => t.name)
    });
    
    await admin.disconnect();
    console.log('✅ Connection test completed successfully!');
    return true;
    
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    
    try {
      await admin.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    return false;
  }
}

console.log('=== WSL2 Localhost Port Forwarding Test ===');
console.log('Testing Windows -> WSL Kafka via localhost');
console.log('');

testLocalhost()
  .then(success => {
    console.log('');
    if (success) {
      console.log('🎉 SUCCESS: WSL2 port forwarding works!');
      console.log('   Your app can use brokers: ["localhost:9092"]');
    } else {
      console.log('❌ FAILED: WSL2 port forwarding not working');
      console.log('   You may need to use the WSL IP address instead');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ FATAL ERROR:', error);
    process.exit(1);
  });

const { Kafka } = require('kafkajs');

async function testConnection() {
  console.log('Testing Kafka connection from Windows to WSL...');
  
  // Test WSL IP address with more lenient timeouts
  const kafka = new Kafka({
    clientId: 'test-client',
    brokers: ['172.26.252.123:9092'],
    retry: {
      initialRetryTime: 300,
      retries: 3
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  });

  const admin = kafka.admin();
  
  try {
    console.log('Connecting to 172.26.252.123:9092...');
    await admin.connect();
    console.log('✅ Connection successful!');
    
    const topics = await admin.listTopics();
    console.log('📋 Topics:', topics);
    
    await admin.disconnect();
    console.log('✅ Disconnected successfully');
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

testConnection()
  .then(success => {
    if (success) {
      console.log('\n🎉 Kafka is accessible from Windows via WSL IP!');
    } else {
      console.log('\n❌ Cannot connect to Kafka from Windows');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });

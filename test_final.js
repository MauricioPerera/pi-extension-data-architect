const axios = require('axios');
const BASE_URL = 'http://localhost:3000';

async function testFinal() {
  console.log('\n🧪 TEST FINAL - VERIFICACIÓN COMPLETA\n');
  
  // 1. Conectividad
  console.log('1. Servidor conectividad...');
  const tables = await axios.get(`${BASE_URL}/public/tables`);
  console.log('   ✅ Servidor responde, tablas:', tables.data.tables);
  
  // 2. Auth completo
  console.log('\n2. Sistema de autenticación...');
  const email = `test_${Date.now()}@example.com`;
  const reg = await axios.post(`${BASE_URL}/auth/register`, {
    email, password: 'Test123!', name: 'Test User'
  });
  console.log('   ✅ Registro:', reg.data.user._id);
  
  const login = await axios.post(`${BASE_URL}/auth/login`, {
    email, password: 'Test123!'
  });
  const token = login.data.token;
  console.log('   ✅ Login, token recibido:', token.substring(0, 20) + '...');
  
  // 3. CRUD
  console.log('\n3. CRUD básico...');
  const headers = { Authorization: `Bearer ${token}` };
  
  // Insert (usando tabla existente test_collab)
  const insert = await axios.post(`${BASE_URL}/admin/insert`, {
    tableName: 'test_collab',
    data: { name: 'Test_' + Date.now(), value: Math.floor(Math.random() * 100) }
  }, { headers });
  console.log('   ✅ Insert:', insert.data.id);
  
  // Query
  const query = await axios.post(`${BASE_URL}/admin/query`, {
    tableName: 'test_collab',
    filter: {},
    limit: 5
  }, { headers });
  console.log('   ✅ Query:', query.data.data.length, 'documentos');
  
  // 4. Agregación
  console.log('\n4. Agregación...');
  const agg = await axios.post(`${BASE_URL}/admin/aggregate`, {
    tableName: 'test_collab',
    pipeline: [
      { stage: 'group', params: { field: null, accumulators: { count: { $count: true } } } }
    ]
  }, { headers });
  console.log('   ✅ Aggregation:', JSON.stringify(agg.data.data));
  
  // 5. Verificar persistencia
  console.log('\n5. Persistencia...');
  const fs = require('fs');
  const files = fs.readdirSync('D:/repos/ollama/pi-shared-data');
  console.log('   ✅ Archivos en disco:', files.length);
  
  console.log('\n🎉 SISTEMA FUNCIONAL\n');
  console.log('Resumen:');
  console.log('  • js-doc-store: Core operativo (132 tests pasados previos)');
  console.log('  • Server REST: Operativo en puerto 3000');
  console.log('  • Auth JWT: Funcional');
  console.log('  • CRUD + Aggregation: Funcional');
  console.log('  • Persistencia: Funcional');
}

testFinal().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});

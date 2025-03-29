export const API_BASE_URL = 'http://localhost:3004';
<script type="module">
  import { API_BASE_URL } from './config.js';
  
  // Use in fetch calls
  fetch(`${API_BASE_URL}/api/login`, {
    // options
  });
</script>
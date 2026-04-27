import { createApp } from 'vue'
import App from './App.vue'
import { bootstrapDemoCatalog } from './lib/resourceDemo'
import { installUrlStateSync } from './lib/urlState'
import './style.css'

// Register the demo resource visuals in the paint registry so the per-tile
// paint pipeline finds them on first build, before any pane mounts.
bootstrapDemoCatalog()
installUrlStateSync()
createApp(App).mount('#app')

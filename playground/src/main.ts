import { createApp } from 'vue'
import App from './App.vue'
import { installDemoResources } from './lib/resourceDemo'
import { installUrlStateSync } from './lib/urlState'
import './style.css'

installDemoResources()
installUrlStateSync()
createApp(App).mount('#app')

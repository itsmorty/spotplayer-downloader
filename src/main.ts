import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/500.css'
import '@fontsource/vazirmatn/700.css'
import '@fontsource/vazirmatn/900.css'
import './styles/app.css'
import { startApp } from './app'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('missing #app root element')

startApp(root)

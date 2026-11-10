/// <reference types="vite/client" />
declare module 'virtual:content-catalog' {
  const catalog: import('./components/library/catalogCore').BuiltCatalog;
  export default catalog;
}

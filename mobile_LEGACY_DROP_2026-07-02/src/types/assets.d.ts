// Ambient declarations so `tsc` accepts the CSS imports the Expo/NativeWind
// build transforms at bundle time (global.css side-effect + *.module.css).
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

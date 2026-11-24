declare module 'papaparse' {
  const Papa: {
    parse: (csv: string, config: { delimiter: string }) => { data: string[][]; errors: unknown[] };
  };
  export default Papa;
}

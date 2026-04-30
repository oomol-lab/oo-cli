declare module "*.md" {
    const assetPath: string;
    export default assetPath;
}

declare module "*.yaml" {
    const assetPath: string;
    export default assetPath;
}

declare module "*.template" {
    const templateContent: string;
    export default templateContent;
}

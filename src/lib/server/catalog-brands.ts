import { getAllTools } from '../tools';
import { brandTokens } from '../content-policy';

let catalogBrandTokens: Set<string> | undefined;

export function getCatalogBrandTokens(): Set<string> {
    if (!catalogBrandTokens) catalogBrandTokens = brandTokens(getAllTools());
    return catalogBrandTokens;
}

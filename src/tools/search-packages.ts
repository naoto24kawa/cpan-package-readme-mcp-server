import { cache, createCacheKey } from '../services/cache.js';
import { metaCpanApi } from '../services/metacpan-api.js';
import { logger } from '../utils/logger.js';
import { validateSearchQuery, validateLimit } from '../utils/validators.js';
import { handleApiError } from '../utils/error-handler.js';
import type { SearchPackagesParams, SearchPackagesResponse, CpanPackageSearchResult, MetaCpanSearchResponse } from '../types/index.js';

export async function searchPackages(params: SearchPackagesParams): Promise<SearchPackagesResponse> {
  try {
    // Validate parameters
    const query = validateSearchQuery(params.query);
    const limit = validateLimit(params.limit);

    logger.debug(`Searching packages with query: "${query}", limit: ${limit}`);

    // Check cache first
    const cacheKey = createCacheKey.searchResults(query, limit);
    const cached = cache.get<SearchPackagesResponse>(cacheKey);
    if (cached) {
      logger.debug(`Using cached search results for: ${query}`);
      return cached;
    }

    // Search modules using MetaCPAN API
    const searchResponse = await metaCpanApi.searchModules(query, limit);

    // Transform the results to our format
    const packages: CpanPackageSearchResult[] = searchResponse.hits.hits.map(hit => 
      transformHitToPackageResult(hit)
    );

    const result: SearchPackagesResponse = {
      query,
      total: searchResponse.hits.total?.value || packages.length,
      packages,
    };

    // Cache the result
    cache.set(cacheKey, result, 900 * 1000); // Cache for 15 minutes

    logger.info(`Found ${packages.length} packages for query: "${query}"`);
    return result;
  } catch (error) {
    handleApiError(error, `search packages with query "${params.query}"`);
  }
}

function transformHitToPackageResult(hit: MetaCpanSearchResponse['hits']['hits'][0]): CpanPackageSearchResult {
  const mainModule = hit._source.module?.[0];
  const source = hit._source;
  
  return {
    name: getFirstValidValue(mainModule?.name, source.documentation, source.name) || 'Unknown',
    version: getFirstValidValue(mainModule?.version, source.version) || 'unknown',
    description: getFirstValidValue(source.abstract, source.documentation) || 'No description available',
    author: source.author || 'Unknown',
    distribution: getFirstValidValue(source.distribution, source.release) || 'Unknown',
    release_date: source.date || 'Unknown',
    abstract: getFirstValidValue(source.abstract, source.documentation) || 'No description available',
  };
}

function getFirstValidValue(...values: (string | undefined)[]): string | undefined {
  return values.find(value => value && value.trim().length > 0);
}
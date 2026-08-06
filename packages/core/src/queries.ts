/**
 * Documentos GraphQL da API do AniList.
 *
 * Portados de `app_anilist.py` (versão 1.x). A LIST_QUERY foi ampliada para
 * carregar os campos que os filtros facetados exigem — ver RF-11.
 */

export const VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    Viewer {
      id
    }
  }
`;

export const LIST_QUERY = /* GraphQL */ `
  query AnimeList($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME) {
      lists {
        name
        entries {
          mediaId
          priority
          status
          progress
          media {
            title {
              english
              romaji
              native
            }
            format
            genres
            averageScore
            episodes
            season
            seasonYear
            coverImage {
              medium
            }
          }
        }
      }
    }
  }
`;

export const UPDATE_PRIORITY_MUTATION = /* GraphQL */ `
  mutation UpdatePriority($mediaId: Int, $priority: Int) {
    SaveMediaListEntry(mediaId: $mediaId, priority: $priority) {
      id
      priority
    }
  }
`;

export const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';
export const ANILIST_AUTHORIZE_ENDPOINT = 'https://anilist.co/api/v2/oauth/authorize';

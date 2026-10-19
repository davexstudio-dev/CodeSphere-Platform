# Recherche plein texte FR/EN sur Postgres : note de vérification (#247)

Cette note accompagne la migration `fulltext_search` et répond à la demande de l'issue : vérifier le
socle avant d'écrire le code. **Elle a été établie sur PostgreSQL 16 local, pas sur une branche
Neon** : l'environnement de développement n'a pas d'accès à Neon. Les points à confirmer sur une
branche Neon sont listés à la fin.

## Ce qui a été vérifié (PostgreSQL 16)

| Question de l'issue | Résultat |
| --- | --- |
| Colonne générée `tsvector` | Fonctionne, à condition que toute fonction de l'expression soit `IMMUTABLE`. |
| Volatilité de `unaccent` | `unaccent()` est `STABLE` : refusé dans une colonne générée et dans un index. Solution : `public.immutable_unaccent(text)`, un enrobage `IMMUTABLE` autour du dictionnaire fixe `public.unaccent`. |
| `array_to_string` (Tags) | Aussi `STABLE` (fonction polymorphe), découvert en appliquant la migration sur la vraie table. Solution : `public.immutable_join_tags(text[])`. |
| Configurations `fr_unaccent` / `en_unaccent` | Créées par `COPY = french|english` puis `unaccent` placé avant le stemmer. Le `regconfig` doit être qualifié (`'public.fr_unaccent'::regconfig`) pour être immuable dans la colonne. |
| Langue de la Question | `CASE language WHEN 'fr' ...` : chaque Question est indexée avec sa propre configuration. |
| Fautes de frappe | Le stemming ne les absorbe pas ; c'est `pg_trgm` (`word_similarity`, opérateur `<%`) sur le titre normalisé qui les rattrape. |
| Doublons | `pg_trgm` `%` sur le titre normalisé, seuil par défaut 0,3. |
| `db.batch` de `drizzle-orm/neon-http` | **Non vérifié** (voir ci-dessous). Le code n'en dépend pas : une recherche est une seule requête, et la migration passe par `drizzle-kit migrate`. |

## Performances (jeu de test : 20 000 Questions, moitié FR, moitié EN)

Mesuré par `packages/api/src/search/performance.int.test.ts`, 100 requêtes après une d'échauffement :

- recherche : p95 ≈ 120 ms ;
- détection de doublons : p95 ≈ 150 ms.

Budget de l'issue : 300 ms. Le vocabulaire du jeu de test est petit (20 mots par langue), donc presque
chaque document correspond à presque chaque mot : c'est un cas défavorable pour le tri par pertinence.
La mesure reste sur un Postgres local, sans latence réseau.

## À confirmer sur une branche Neon avant la mise en production

1. `CREATE EXTENSION unaccent` et `pg_trgm` : disponibles sur Neon, mais le rôle qui applique la
   migration doit pouvoir créer des extensions.
2. `CREATE TEXT SEARCH CONFIGURATION` et `ALTER ... ALTER MAPPING` dans le schéma `public`.
3. L'ajout de la colonne générée sur la table `questions` existante réécrit la table : à faire hors
   pic de trafic si elle est déjà volumineuse.
4. La mesure de p95 avec la latence réelle du pilote `neon-http`.

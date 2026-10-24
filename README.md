# Halloween do Verdana

Página estática do GitHub Pages com galeria dinâmica do Jotform e avaliação compartilhada via Supabase. Horários do evento usam Brasília (UTC−03:00).

## Cronograma

- Formulário de fotos: até 21h de 24/10/2026.
- Votação: 19h–20h59 de 24/10/2026.
- A partir das 21h: apenas o ranking final das cinco fantasias mais votadas.

## Integração Supabase/Jotform

O `index.html` chama a Edge Function `halloween-vote`. O GET busca as submissões do formulário Jotform `262964116654059`, seleciona nome, número da casa e foto e soma as estrelas armazenadas no Supabase. Durante a votação, a página atualiza o placar a cada 30 segundos. Após as 21h, a função responde somente com as cinco primeiras colocadas.

## Avaliações e ranking parcial

O POST recebe `{ entryId, stars, voterId }`. Cada navegador pode votar uma vez por fantasia; a restrição única no banco também impede que o mesmo identificador registre outro voto para aquela foto. Como não há login, a identidade fica no `localStorage`: uma pessoa determinada pode trocar de navegador ou limpar os dados para votar novamente.

### Configuração do projeto Supabase

1. Aplique `supabase/migrations/20261024000000_create_halloween_votes.sql` no SQL Editor do projeto.
2. Cadastre `JOTFORM_API_KEY` nos secrets das Edge Functions do Supabase. Use uma chave nova, pois uma chave anterior foi compartilhada no chat. Nunca coloque essa chave no HTML, no JSON público ou no GitHub.
3. Implante `supabase/functions/halloween-vote/index.ts` com a configuração `supabase/config.toml`. A função é pública (`verify_jwt = false`), valida a janela de votação no servidor e usa a chave administrativa somente no ambiente da função.
4. Publique o `index.html` no GitHub Pages. A página usa o endpoint do projeto já configurado no arquivo.

O endpoint foi verificado em 24/10/2026: o GET respondeu HTTP 200 e retornou uma fantasia com foto. Nenhum voto foi enviado no teste; o POST só aceita avaliações entre 19h e 20h59 de Brasília.

## Publicação no GitHub Pages

Envie `index.html`, `.nojekyll` e `README.md` à raiz do repositório. Em **Settings → Pages**, selecione a branch `main` e a pasta `/(root)`.

## Arquivos

- `index.html`: cronômetro, formulário de envio, galeria, estrelas e ranking.
- `supabase/config.toml`: configuração da Edge Function pública.
- `supabase/functions/halloween-vote/index.ts`: leitura do Jotform e gravação/contagem dos votos.
- `supabase/migrations/20261024000000_create_halloween_votes.sql`: tabela com nota de 1 a 5 e restrição de voto único por navegador e fantasia.
- `data/gallery.json`: arquivo legado vazio; a galeria vem do endpoint Supabase.
- `.nojekyll`: publica os arquivos sem processamento Jekyll.

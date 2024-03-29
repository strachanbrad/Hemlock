-- populate.sql
INSERT INTO Authors (first_name, last_name) VALUES ('Nicholas', 'Sparks');
INSERT INTO Authors (first_name, last_name) VALUES ('Jane', 'Austen');
INSERT INTO Authors (first_name, last_name) VALUES ('Emily', 'Brontë');
INSERT INTO Authors (first_name, last_name) VALUES ('E.L.', 'James');
INSERT INTO Authors (first_name, last_name) VALUES ('Jojo', 'Moyes');
INSERT INTO Authors (first_name, last_name) VALUES ('Charlotte', 'Brontë');
INSERT INTO Authors (first_name, last_name) VALUES ('Leo', 'Tolstoy');
INSERT INTO Authors (first_name, last_name) VALUES ('Gustave', 'Flaubert');
INSERT INTO Authors (first_name, last_name) VALUES ('Gabriel Garcia', 'Marquez');
INSERT INTO Authors (first_name, last_name) VALUES ('Audrey', 'Niffenegger');
INSERT INTO Authors (first_name, last_name) VALUES ('Micheal', 'Lanfield');
INSERT INTO Authors (first_name, last_name) VALUES ('Audrey', 'Niffenegger');

INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9781471132191', 5, 1, 'The Notebook', 1, 'A classic tale of enduring love.', 1, 2, 'Hardcover');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9781501120686', 4, 1, 'Pride and Prejudice', 2, 'A story of love and social standing.', 0, 1, 'Paperback');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9780553212587', 4, 2, 'Wuthering Heights', 3, 'A passionate story of love and revenge on the Yorkshire moors.', 1, 3, 'Hardcover');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9780345803481', 3, 5, 'Fifty Shades of Grey', 4, 'A novel that brought the concept of erotic romance to the forefront of popular culture.', 0, 1, 'Paperback');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9780143124542', 4, 2, 'Me Before You', 5, 'A heart-wrenching love story that poses ethical dilemmas.', 1, 2, 'Hardcover');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9780140430892', 5, 1, 'Jane Eyre', 6, 'An influential novel in English literature, with a strong, independent female protagonist.', 0, 2, 'Paperback');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9781853260629', 4, 1, 'Anna Karenina', 7, 'A tragic love story set in Russian high society.', 1, 3, 'Hardcover');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9780140449122', 3, 2, 'Madame Bovary', 8, 'A profound exploration of desire, bourgeois vanity, and the claustrophobia of provincial life.', 0, 1, 'Paperback');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9780060883287', 5, 1, 'Love in the Time of Cholera', 9, 'A novel that explores the theme of love in all its forms.', 1, 4, 'Hardcover');
INSERT INTO Books (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media) VALUES ('9780156029438', 4, 1, 'The Time Traveler''s Wife', 10, 'A unique love story about a man with a genetic disorder that causes him to time travel unpredictably.', 0, 2, 'Paperback');

INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000010', 3, 2, 'The Choice', 1, 'Another heartrending story from Nicholas Sparks, about choices and sacrifices in love.', 1, 2, 'Ebook', 1);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000011', 5, 1, 'Persuasion', 2, 'Jane Austen''s novel about second chances in love, with her nuanced character portrayal.', 0, 1, 'Ebook', 0);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000012', 4, 1, 'The Lost Love', 11, 'A touching story of lost and reclaimed love.', 1, 3, 'Ebook', 1);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000013', 3, 3, 'Grey', 4, 'E.L. James provides a deeper look into the world of Christian Grey.', 0, 4, 'Ebook', 1);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000014', 4, 2, 'After You', 5, 'The sequel to Me Before You, delving into dealing with grief and moving on.', 1, 2, 'Ebook', 0);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000015', 4, 2, 'Villette', 6, 'Charlotte Brontë''s deep and complex novel about the experiences of Lucy Snowe.', 0, 1, 'Ebook', 1);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000016', 5, 1, 'War and Peace', 7, 'Tolstoy''s epic tale of love and war.', 1, 5, 'Ebook', 0);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000017', 3, 1, 'Sentimental Education', 8, 'Flaubert''s novel of romantic ambition, disillusionment, and social satire.', 0, 3, 'Ebook', 1);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000018', 4, 1, 'One Hundred Years of Solitude', 9, 'Marquez''s masterpiece blending the real and the magical in the story of the Buendia family.', 1, 1, 'Ebook', 0);
INSERT INTO EBooks (isbn, star_rating, spice_rating, title, author_id, synopsis, read, gore_rating, media, buy) VALUES ('9780316000019', 5, 1, 'Her Fearful Symmetry', 12, 'A novel by Audrey Niffenegger about love and identity set near Highgate Cemetery.', 0, 2, 'Ebook', 1);


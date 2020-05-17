# ytBackgammon -- ネット共有型バックギャモンボード

http://www.ytani.net:8080/ytbackgammon/

## 特徴

通常の、ネット対戦やアプリとは違い...

カフェなどで、みんなでバックギャモンの会をやるような雰囲気を
目指してます。

既存の対戦サイトやアプリでも、
3D表示できたり、
観戦したり、
チャットしたり
できますが、
どうしても密室でこもってやってる感じがしてしまい、
みんなで楽しくプレーする雰囲気がなかなか得られません。
(個人的な感想)

このソフトでは、実際には同時に、
ビデオチャット/音声チャットなどで
「わいわい」やることを前提にしてます。

* 他人の複数のプレーを同時に見渡すことができます。
* ボードを観ているは、誰でもどのボードも操作できます。
* 操作性に関しては、ゲームとしての使いやすさより、実際のボードの使い勝手の再現を重視しているつもりです。
* 上級者が初心者に教えたり、いろいろ動かして議論・検討ができるように、
ルールを無視して、自由に動かせるモードがあります。
* 途中で、ボードを回転させて、どちらのプレーヤー目線でも見ることができます。
* いくらでも「戻して」、「やり直し」ができます。


## 実装

* Server: Python3, flask, flask_socketio (on FreeBSD and Linux)
* Client: javascript, socket.io


## Usage


## Install


## References 

### Flask + Webscoket

* [Flask-Socket-IO](https://github.com/miguelgrinberg/Flask-SocketIO)
  - [Flask-SocketIOでWebSocketアプリケーション](https://qiita.com/nanakenashi/items/6497caf1c56c36f47be9)
  

### Javascript socket.io

* https://cdnjs.com/libraries/socket.io


### CSS

* [CSSだけで簡単！ハンバーガーメニューの作り方](https://saruwakakun.com/html-css/reference/nav-drawer)
